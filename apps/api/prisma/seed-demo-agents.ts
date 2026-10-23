/**
 * 데모 AI 에이전트 블루프린트(AIX-04) — AI 에이전트 관리 화면에서 바로 열어 보고 테스트 실행할 예시 3개.
 *
 *   pnpm --filter @tongin/api demo:seed:agents
 *
 * 1) 미계약 고객 재안내 문자 — 시작 → 가드레일 → search_leads(미계약) → 분기(대상 있음?) → AI 문자 작성 → 사람 승인 → send_sms → 출력
 * 2) 신규 접수 자동 분류·담당 배정 — 이벤트(lead.created) → 접수 조회 → AI 분류(가정이사·기업이전·리빙케어) → 직원 조회 → AI 담당 선택 → 승인 → 접수 수정
 * 3) 주간 실적 요약 보고 — 예약(월 09:00) → 통계·지점 현황 조회 → AI 요약 → 출력
 *
 * 멱등하다 — 고정 id로 만들고, 재실행하면 같은 id의 블루프린트를 덮어쓴다(테스트 실행 기록은 지운다).
 * 사용자가 만든 블루프린트는 건드리지 않는다.
 */
import { PrismaClient } from '@prisma/client';
import {
  autoLayout,
  defaultConfig,
  type AgentEdge,
  type AgentGraph,
  type AgentNode,
  type AgentNodeConfigMap,
  type AgentNodeType,
} from '@tongin/shared';

const prisma = new PrismaClient();

const demoId = (n: number) => `00000000-0000-4000-8000-0000000a9${String(n).padStart(3, '0')}`;

function node<T extends AgentNodeType>(
  id: string,
  type: T,
  label: string,
  config: Partial<AgentNodeConfigMap[T]>,
): AgentNode {
  return {
    id,
    type,
    label,
    position: { x: 0, y: 0 },
    config: { ...defaultConfig(type), ...config } as AgentNodeConfigMap[T],
  } as AgentNode;
}

function wire(source: string, sourceHandle: string, target: string): AgentEdge {
  return { id: `e_${source}_${sourceHandle}_${target}`, source, sourceHandle, target };
}

function graph(nodes: AgentNode[], edges: AgentEdge[]): AgentGraph {
  return autoLayout({ version: 1, nodes, edges });
}

const SMS_RULES = [
  '당신은 통인익스프레스(이사·리빙케어) 고객 안내 문자를 쓰는 담당자입니다.',
  '- 본문은 [통인익스프레스]로 시작하고 {고객명}으로 고객 이름을 부릅니다(시스템이 바꿔 넣음).',
  '- 90자 안팎, 정중하고 짧게. 할인·약속처럼 확인되지 않은 내용은 쓰지 않습니다.',
  '- 문자 본문만 출력합니다(설명·따옴표 없이).',
].join('\n');

function unsignedFollowUp(): AgentGraph {
  return graph(
    [
      node('start', 'trigger', '수동 실행', {
        kind: 'manual',
        inputFields: [
          {
            name: 'days',
            type: 'number',
            required: false,
            description: '며칠 전 접수까지(참고용)',
          },
        ],
      }),
      node('guard', 'guardrail', '발송 가드레일', {
        rules: [
          { kind: 'maxRecipients', value: 50 },
          { kind: 'maxLlmCalls', value: 3 },
          { kind: 'piiMask' },
        ],
      }),
      node('find_leads', 'tool', '미계약 고객 찾기', {
        tool: 'search_leads',
        args: {
          contracted: 'false',
          dateField: 'createdAt',
          from: '{{run.weekAgo}}',
          to: '{{run.today}}',
          limit: '50',
        },
        outputVar: 'leads',
      }),
      node('has_targets', 'branch', '대상이 있나?', {
        mode: 'condition',
        cases: [{ id: 'yes', label: '있음', expr: 'leads.total > 0', description: '' }],
      }),
      node('write_sms', 'llm', '안내 문자 쓰기', {
        model: 'claude-haiku-5-5',
        effort: 'low',
        instructions: SMS_RULES,
        prompt:
          '최근 1주일 동안 견적만 받고 아직 계약하지 않은 고객 {{leads.total}}명에게 보낼 재안내 문자를 써 주세요.\n' +
          '대표 고객 상태: {{leads.rows[0].status}}, 최근 견적: {{leads.rows[0].latestEstimate}}',
        outputFormat: 'text',
        outputVar: 'smsText',
      }),
      node('approve', 'approval', '발송 승인', {
        message: '미계약 고객 {{leads.returned}}명에게 아래 문자를 보낼까요?\n{{smsText}}',
      }),
      node('send', 'tool', '문자 발송', {
        tool: 'send_sms',
        args: {
          customerIds: '{{leads.rows[*].customerId}}',
          message: '{{smsText}}',
          purpose: '미계약 고객 재안내(에이전트)',
        },
        outputVar: 'sent',
      }),
      node('done', 'output', '발송 결과', {
        template: '미계약 고객 {{leads.total}}명 중 {{sent.sent}}명에게 재안내 문자를 보냈습니다.',
      }),
      node('none', 'output', '대상 없음', {
        template: '최근 1주일 미계약 고객이 없어 문자를 보내지 않았습니다.',
      }),
      node('canceled', 'output', '발송 취소', { template: '담당자가 발송을 승인하지 않았습니다.' }),
    ],
    [
      wire('start', 'out', 'guard'),
      wire('guard', 'out', 'find_leads'),
      wire('find_leads', 'out', 'has_targets'),
      wire('has_targets', 'yes', 'write_sms'),
      wire('has_targets', 'else', 'none'),
      wire('write_sms', 'out', 'approve'),
      wire('approve', 'approved', 'send'),
      wire('approve', 'rejected', 'canceled'),
      wire('send', 'out', 'done'),
    ],
  );
}

function autoAssign(): AgentGraph {
  return graph(
    [
      node('start', 'trigger', '신규 접수 시', {
        kind: 'event',
        event: 'lead.created',
        inputFields: [
          { name: 'leadId', type: 'string', required: true, description: '새로 들어온 접수 id' },
        ],
      }),
      node('guard', 'guardrail', '도구 제한', {
        rules: [
          {
            kind: 'allowTools',
            list: ['erp_leads_find_one', 'erp_employees_find_all', 'erp_leads_update'],
          },
          { kind: 'maxLlmCalls', value: 3 },
        ],
      }),
      node('get_lead', 'tool', '접수 조회', {
        tool: 'erp_leads_find_one',
        args: { id: '{{input.leadId}}' },
        outputVar: 'lead',
      }),
      node('classify', 'branch', '접수 분류', {
        mode: 'classify',
        input: '접수 내용: {{lead}}',
        instructions: '이사·청소 문의 접수를 서비스 종류로 분류합니다.',
        model: 'claude-haiku-5-5',
        outputVar: 'category',
        cases: [
          { id: 'moving', label: '가정이사', expr: '', description: '가정집 이사(원룸·아파트 등)' },
          { id: 'office', label: '기업이전', expr: '', description: '사무실·기업 이전' },
          {
            id: 'living',
            label: '리빙케어',
            expr: '',
            description: '입주청소·정리수납 등 리빙 서비스',
          },
        ],
      }),
      node('get_emps', 'tool', '지점 직원 조회', {
        tool: 'erp_employees_find_all',
        args: { orgUnitId: '{{lead.orgUnitId}}' },
        outputVar: 'emps',
      }),
      node('pick', 'llm', '담당자 고르기', {
        model: 'claude-haiku-5-5',
        effort: 'low',
        instructions:
          '접수 분류와 직원 목록을 보고 상담을 맡길 직원 한 명을 고릅니다. 목록에 있는 직원 id만 씁니다.',
        prompt: '분류: {{category}}\n접수: {{lead}}\n직원 목록: {{emps}}',
        outputFormat: 'json',
        jsonFields: [
          { name: 'ownerEmpId', type: 'string', description: '고른 직원 id' },
          { name: 'serviceLine', type: 'string', description: 'MOVING·B2B_MOVING·LIVING 중 하나' },
          { name: 'reason', type: 'string', description: '고른 이유 한 줄' },
        ],
        outputVar: 'pick',
      }),
      node('approve', 'approval', '배정 승인', {
        message:
          '접수 {{lead.leadNo}}을(를) {{category}}로 분류해 담당자를 배정할까요? ({{pick.reason}})',
      }),
      node('assign', 'tool', '담당 배정', {
        tool: 'erp_leads_update',
        args: {
          id: '{{input.leadId}}',
          body: '{"ownerEmpId":"{{pick.ownerEmpId}}","serviceLine":"{{pick.serviceLine}}"}',
        },
        outputVar: 'updated',
      }),
      node('done', 'output', '배정 완료', {
        template:
          '접수 {{lead.leadNo}} → {{category}}, 담당 {{pick.ownerEmpId}} 배정({{pick.reason}})',
      }),
      node('manual', 'output', '수동 배정 필요', {
        template: '접수 {{lead.leadNo}}은(는) 자동 분류가 어려워 수동 배정이 필요합니다.',
      }),
    ],
    [
      wire('start', 'out', 'guard'),
      wire('guard', 'out', 'get_lead'),
      wire('get_lead', 'out', 'classify'),
      wire('classify', 'moving', 'get_emps'),
      wire('classify', 'office', 'get_emps'),
      wire('classify', 'living', 'get_emps'),
      wire('classify', 'else', 'manual'),
      wire('get_emps', 'out', 'pick'),
      wire('pick', 'out', 'approve'),
      wire('approve', 'approved', 'assign'),
      wire('assign', 'out', 'done'),
    ],
  );
}

function weeklyReport(): AgentGraph {
  return graph(
    [
      node('start', 'trigger', '매주 월요일 9시', { kind: 'schedule', cron: '0 9 * * 1' }),
      node('guard', 'guardrail', '읽기 전용', {
        rules: [
          { kind: 'blockTools', list: ['send_sms'] },
          { kind: 'maxLlmCalls', value: 1 },
        ],
      }),
      node('stats', 'tool', '대시보드 통계', { tool: 'erp_stats_overview', outputVar: 'stats' }),
      node('branches', 'tool', '지점 현황', {
        tool: 'erp_branches_overview',
        outputVar: 'branches',
      }),
      node('summary', 'llm', '주간 요약 쓰기', {
        model: 'claude-sonnet-5-5',
        effort: 'low',
        instructions:
          '통인익스프레스 본사 경영진에게 보낼 주간 실적 보고를 씁니다. 핵심 숫자 3~5개와 눈에 띄는 지점, 다음 주 주의점을 한국어 불릿으로 짧게.',
        prompt: '오늘: {{run.today}}\n대시보드 통계: {{stats}}\n지점 현황: {{branches}}',
        outputVar: 'report',
      }),
      node('out', 'output', '보고서', {
        template: '## 주간 실적 요약 ({{run.today}})\n{{report}}',
      }),
    ],
    [
      wire('start', 'out', 'guard'),
      wire('guard', 'out', 'stats'),
      wire('stats', 'out', 'branches'),
      wire('branches', 'out', 'summary'),
      wire('summary', 'out', 'out'),
    ],
  );
}

const BLUEPRINTS = [
  {
    n: 1,
    name: '미계약 고객 재안내 문자',
    description:
      '최근 1주일 견적만 받고 계약하지 않은 고객을 찾아 AI가 안내 문자를 쓰고, 담당자 승인 후 발송합니다.',
    status: 'ACTIVE',
    prompt: '이번 주 미계약 고객에게 재안내 문자를 보내는 에이전트',
    graph: unsignedFollowUp(),
  },
  {
    n: 2,
    name: '신규 접수 자동 분류·담당 배정',
    description:
      '새 접수가 들어오면 AI가 서비스 종류를 분류하고 지점 직원 중 담당자를 골라, 승인 후 접수에 배정합니다.',
    status: 'DRAFT',
    prompt: '신규 접수를 자동으로 분류하고 담당자를 배정하는 에이전트',
    graph: autoAssign(),
  },
  {
    n: 3,
    name: '주간 실적 요약 보고',
    description: '매주 월요일 대시보드 통계와 지점 현황을 모아 AI가 경영진용 주간 요약을 씁니다.',
    status: 'ACTIVE',
    prompt: '매주 월요일 아침 주간 실적을 요약해 주는 에이전트',
    graph: weeklyReport(),
  },
];

async function main() {
  const admin = await prisma.appUser.findUnique({ where: { loginId: 'admin' } });
  for (const b of BLUEPRINTS) {
    const id = demoId(b.n);
    await prisma.agentRun.deleteMany({ where: { blueprintId: id } });
    const data = {
      name: b.name,
      description: b.description,
      status: b.status,
      graph: b.graph as object,
      prompt: b.prompt,
      createdBy: admin?.id ?? null,
    };
    await prisma.agentBlueprint.upsert({ where: { id }, update: data, create: { id, ...data } });
    console.log(
      `에이전트 '${b.name}' — 노드 ${b.graph.nodes.length}개 · 선 ${b.graph.edges.length}개`,
    );
  }
  console.log(`\n데모 에이전트 블루프린트 ${BLUEPRINTS.length}개`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
