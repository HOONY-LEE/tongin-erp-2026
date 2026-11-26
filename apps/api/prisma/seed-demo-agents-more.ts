/**
 * 데모 AI 에이전트 블루프린트 추가분(AIX-04) — 부서별로 바로 쓸 만한 예시 6개.
 *
 *   pnpm --filter @tongin/api demo:seed:agents-more
 *
 * 1) 고객관리부 주간 보고 — 예약(월 09:00) → 지점별·경로별 실적 → 미계약 접수 → CS 티켓 → 엑셀 2개 → 요약
 * 2) 경영지원실 미수금·입금 현황 — 예약(월 09:30) → 미수금 → 이번 주 입금 → 7일 넘은 미입금 → 엑셀 → 요약
 * 3) 이번 주 이사 일정·작업팀 점검 — 예약(매일 08:30) → 7일 안 이사 → 3일 안 작업팀 미배정 → 엑셀 → 경고/정상
 * 4) 내 결재 대기 정리 — 수동 → 내가 결재할 문서 → AI 우선순위 정리(1번) → 엑셀 → 출력 (읽기 전용)
 * 5) 이사 전날 안내 문자 — 예약(매일 17:00) → 내일 이사 고객 → 사람 승인 → 문자(정해진 문구, 한도 50명)
 * 6) CS 티켓 긴급도 분류 — 이벤트(support.created) → 티켓 조회 → AI 분류 → 긴급이면 승인 후 우선순위 높임
 *
 * AI 호출은 꼭 필요한 곳(자유 글 판단·정리)에만 둔다 — 1·2·3·5는 도구와 규칙만으로 돈다(AI 0번).
 * 보고서 파일은 create_report_file에 조회 결과 목록을 그대로 넘기고 fields로 열마다 키를 정한다(AI 없이 표).
 *
 * 멱등하다 — 고정 id로 만들고, 같은 id가 이미 있으면 건너뛴다(시연 중 고친 내용을 덮어쓰지 않음).
 * seed-demo-agents.ts(1~3번 id)와 겹치지 않게 11번부터 쓴다.
 */
import { PrismaClient } from '@prisma/client';
import {
  autoLayout,
  defaultConfig,
  validateAgentGraph,
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

/** 보고서 파일 노드 — 조회 결과 목록(rows)을 그대로 넘기고 열마다 꺼낼 키(fields)를 정한다 */
function reportFile(
  id: string,
  label: string,
  p: { title: string; note: string; columns: string[]; fields: string[]; rows: string },
  outputVar: string,
): AgentNode {
  return node(id, 'tool', label, {
    tool: 'create_report_file',
    args: {
      format: 'xlsx',
      title: p.title,
      note: p.note,
      columns: JSON.stringify(p.columns),
      fields: JSON.stringify(p.fields),
      rows: p.rows,
    },
    outputVar,
  });
}

// ── 1) 고객관리부 주간 보고 ──
function crmWeekly(): AgentGraph {
  const reads = [
    'erp_stats_sales',
    'search_leads',
    'erp_support_tickets_find_all',
    'create_report_file',
  ];
  return graph(
    [
      node('start', 'trigger', '매주 월요일 9시', { kind: 'schedule', cron: '0 9 * * 1' }),
      node('guard', 'guardrail', '읽기 전용', { rules: [{ kind: 'allowTools', list: reads }] }),
      node('by_branch', 'tool', '지점별 실적', {
        tool: 'erp_stats_sales',
        args: { groupBy: 'branch', from: '{{run.weekAgo}}', to: '{{run.today}}' },
        outputVar: 'byBranch',
      }),
      node('by_source', 'tool', '접수 경로별', {
        tool: 'erp_stats_sales',
        args: { groupBy: 'source', from: '{{run.weekAgo}}', to: '{{run.today}}' },
        outputVar: 'bySource',
      }),
      node('unsigned', 'tool', '미계약 접수', {
        tool: 'search_leads',
        args: {
          contracted: 'false',
          dateField: 'createdAt',
          from: '{{run.weekAgo}}',
          to: '{{run.today}}',
          limit: '200',
        },
        outputVar: 'unsigned',
      }),
      node('cs_new', 'tool', 'CS 접수 대기', {
        tool: 'erp_support_tickets_find_all',
        args: { status: 'RECEIVED' },
        outputVar: 'csNew',
      }),
      node('cs_doing', 'tool', 'CS 처리 중', {
        tool: 'erp_support_tickets_find_all',
        args: { status: 'IN_PROGRESS' },
        outputVar: 'csDoing',
      }),
      reportFile(
        'branch_file',
        '지점별 엑셀',
        {
          title: '주간 지점별 접수·계약 현황',
          note: '접수일 {{run.weekAgo}} ~ {{run.today}} 기준',
          columns: ['지점', '접수', '계약', '계약 매출(원)'],
          fields: ['label', 'leads', 'contracts', 'revenue'],
          rows: '{{byBranch.rows}}',
        },
        'branchFile',
      ),
      reportFile(
        'unsigned_file',
        '미계약 명단 엑셀',
        {
          title: '주간 미계약 접수 명단',
          note: '접수일 {{run.weekAgo}} ~ {{run.today}}, 계약 전 단계(취소 제외)',
          columns: ['접수번호', '접수일시', '지점', '고객', '진행상태', '담당', '최근 견적(원)'],
          fields: [
            'leadNo',
            'receivedAt',
            'orgUnit',
            'customerName',
            'status',
            'owner',
            'latestEstimate.totalAmount',
          ],
          rows: '{{unsigned.rows}}',
        },
        'unsignedFile',
      ),
      node('out', 'output', '주간 보고', {
        template: [
          '## 고객관리부 주간 보고 ({{run.weekAgo}} ~ {{run.today}})',
          '- 접수 {{byBranch.total.leads}}건 · 계약 {{byBranch.total.contracts}}건 · 계약 매출 {{byBranch.total.revenue}}원',
          '- 계약 매출 1위 지점: {{byBranch.rows[0].label}} ({{byBranch.rows[0].revenue}}원, 계약 {{byBranch.rows[0].contracts}}건)',
          '- 매출이 많은 접수 경로: {{bySource.rows[0].label}}(접수 {{bySource.rows[0].leads}}건·계약 {{bySource.rows[0].contracts}}건), {{bySource.rows[1].label}}(접수 {{bySource.rows[1].leads}}건·계약 {{bySource.rows[1].contracts}}건)',
          '- 아직 계약하지 않은 접수: {{unsigned.total}}건 — 명단은 엑셀 참고',
          '- CS 티켓: 접수 대기 {{csNew.length}}건 · 처리 중 {{csDoing.length}}건',
          '',
          '첨부: {{branchFile.fileName}} · {{unsignedFile.fileName}}',
        ].join('\n'),
      }),
    ],
    [
      wire('start', 'out', 'guard'),
      wire('guard', 'out', 'by_branch'),
      wire('by_branch', 'out', 'by_source'),
      wire('by_source', 'out', 'unsigned'),
      wire('unsigned', 'out', 'cs_new'),
      wire('cs_new', 'out', 'cs_doing'),
      wire('cs_doing', 'out', 'branch_file'),
      wire('branch_file', 'out', 'unsigned_file'),
      wire('unsigned_file', 'out', 'out'),
    ],
  );
}

// ── 2) 경영지원실 미수금·입금 현황 ──
function receivablesWeekly(): AgentGraph {
  const reads = [
    'erp_stats_overview',
    'erp_settlements_receivables',
    'erp_settlements_payments',
    'create_report_file',
  ];
  return graph(
    [
      node('start', 'trigger', '매주 월요일 9시 30분', { kind: 'schedule', cron: '30 9 * * 1' }),
      node('guard', 'guardrail', '읽기 전용', { rules: [{ kind: 'allowTools', list: reads }] }),
      node('kpi', 'tool', '전체 수금 현황', { tool: 'erp_stats_overview', outputVar: 'stats' }),
      node('recv', 'tool', '고객별 미수금', {
        tool: 'erp_settlements_receivables',
        args: { onlyOutstanding: 'true' },
        outputVar: 'recv',
      }),
      node('paid', 'tool', '이번 주 입금', {
        tool: 'erp_settlements_payments',
        args: { status: 'PAID', from: '{{run.weekAgo}}', to: '{{run.tomorrow}}' },
        outputVar: 'paid',
      }),
      node('overdue', 'tool', '7일 넘은 미입금', {
        tool: 'erp_settlements_payments',
        args: { status: 'PENDING', to: '{{run.weekAgo}}' },
        outputVar: 'overdue',
      }),
      reportFile(
        'recv_file',
        '미수금 엑셀',
        {
          title: '고객별 미수금 현황',
          note: '{{run.today}} 기준, 청구 − 입금 > 0 인 고객',
          columns: ['고객', '계약 수', '청구액(원)', '입금액(원)', '미수금(원)'],
          fields: ['customerName', 'contractCount', 'billed', 'paid', 'outstanding'],
          rows: '{{recv}}',
        },
        'recvFile',
      ),
      reportFile(
        'paid_file',
        '입금 내역 엑셀',
        {
          title: '이번 주 입금 확인 내역',
          note: '입금 요청일 {{run.weekAgo}} ~ {{run.today}}, 입금 완료 건',
          columns: ['입금일시', '계약번호', '고객', '구분', '방법', '금액(원)'],
          fields: ['paidAt', 'contractNo', 'customerName', 'kind', 'method', 'amount'],
          rows: '{{paid}}',
        },
        'paidFile',
      ),
      node('has_overdue', 'branch', '미입금 있나?', {
        mode: 'condition',
        cases: [{ id: 'yes', label: '있음', expr: 'len(overdue) > 0', description: '' }],
      }),
      reportFile(
        'overdue_file',
        '미입금 엑셀',
        {
          title: '7일 넘은 미입금 요청',
          note: '입금 요청 후 7일이 지나도 입금되지 않은 건({{run.weekAgo}} 이전 요청)',
          columns: ['요청일시', '계약번호', '고객', '구분', '방법', '금액(원)', '가상계좌'],
          fields: [
            'createdAt',
            'contractNo',
            'customerName',
            'kind',
            'method',
            'amount',
            'virtualAccount',
          ],
          rows: '{{overdue}}',
        },
        'overdueFile',
      ),
      node('out', 'output', '현황 보고', {
        template: [
          '## 경영지원실 미수금·입금 현황 ({{run.today}})',
          '- 전체 계약 매출 {{stats.kpi.revenue}}원 중 수금 {{stats.kpi.collected}}원, 미수금 {{stats.kpi.outstanding}}원',
          '- 미수금이 남은 고객 {{recv.length}}명 — 가장 큰 건: {{recv[0].customerName}} {{recv[0].outstanding}}원',
          '- 이번 주 입금 확인 {{paid.length}}건',
          '- 요청 후 7일 넘게 입금 안 된 건 {{overdue.length}}건',
          '',
          '첨부: {{recvFile.fileName}} · {{paidFile.fileName}} · {{overdueFile.fileName}}',
        ].join('\n'),
      }),
    ],
    [
      wire('start', 'out', 'guard'),
      wire('guard', 'out', 'kpi'),
      wire('kpi', 'out', 'recv'),
      wire('recv', 'out', 'paid'),
      wire('paid', 'out', 'overdue'),
      wire('overdue', 'out', 'recv_file'),
      wire('recv_file', 'out', 'paid_file'),
      wire('paid_file', 'out', 'has_overdue'),
      wire('has_overdue', 'yes', 'overdue_file'),
      wire('has_overdue', 'else', 'out'),
      wire('overdue_file', 'out', 'out'),
    ],
  );
}

// ── 3) 이번 주 이사 일정·작업팀 점검 ──
function movesCheck(): AgentGraph {
  return graph(
    [
      node('start', 'trigger', '매일 아침 8시 30분', { kind: 'schedule', cron: '30 8 * * *' }),
      node('guard', 'guardrail', '읽기 전용', {
        rules: [{ kind: 'allowTools', list: ['search_leads', 'create_report_file'] }],
      }),
      node('moves', 'tool', '7일 안 이사', {
        tool: 'search_leads',
        args: {
          statuses: '["CONTRACTED","WORK_TOSS"]',
          dateField: 'moveDate',
          from: '{{run.today}}',
          to: '{{run.in7days}}',
          limit: '200',
        },
        outputVar: 'moves',
      }),
      node('no_crew', 'tool', '작업팀 미배정', {
        tool: 'search_leads',
        args: {
          statuses: '["CONTRACTED"]',
          dateField: 'moveDate',
          from: '{{run.today}}',
          to: '{{run.in3days}}',
          limit: '200',
        },
        outputVar: 'noCrew',
      }),
      node('has_moves', 'branch', '이사가 있나?', {
        mode: 'condition',
        cases: [{ id: 'yes', label: '있음', expr: 'moves.total > 0', description: '' }],
      }),
      reportFile(
        'moves_file',
        '일정표 엑셀',
        {
          title: '이번 주 이사 일정',
          note: '이사일 {{run.today}} ~ {{run.in7days}}, 계약·작업토스 단계. 진행상태가 계약이면 작업팀 배정 전',
          columns: ['이사일', '지점', '접수번호', '고객', '진행상태', '담당', '출발지', '도착지'],
          fields: [
            'moveDate',
            'orgUnit',
            'leadNo',
            'customerName',
            'status',
            'owner',
            'from',
            'to',
          ],
          rows: '{{moves.rows}}',
        },
        'movesFile',
      ),
      node('need_crew', 'branch', '미배정이 있나?', {
        mode: 'condition',
        cases: [{ id: 'yes', label: '있음', expr: 'noCrew.total > 0', description: '' }],
      }),
      node('warn', 'output', '배정 필요', {
        template: [
          '## 이사 일정 점검 ({{run.today}})',
          '- 앞으로 7일 이사 {{moves.total}}건 — 일정표: {{movesFile.fileName}}',
          '- ⚠ 3일 안에 이사인데 작업팀 배정(작업토스) 전인 건 {{noCrew.total}}건',
          '  접수번호: {{noCrew.rows[*].leadNo}}',
          '  지점: {{noCrew.rows[*].orgUnit}}',
          '  이사일: {{noCrew.rows[*].moveDate}}',
          '오늘 안에 작업팀을 배정해 주세요.',
        ].join('\n'),
      }),
      node('ok', 'output', '모두 배정', {
        template: [
          '## 이사 일정 점검 ({{run.today}})',
          '- 앞으로 7일 이사 {{moves.total}}건 — 일정표: {{movesFile.fileName}}',
          '- 3일 안 이사는 모두 작업팀이 배정되어 있습니다.',
        ].join('\n'),
      }),
      node('none', 'output', '이사 없음', {
        template: '앞으로 7일({{run.today}} ~ {{run.in7days}}) 잡힌 이사가 없습니다.',
      }),
    ],
    [
      wire('start', 'out', 'guard'),
      wire('guard', 'out', 'moves'),
      wire('moves', 'out', 'no_crew'),
      wire('no_crew', 'out', 'has_moves'),
      wire('has_moves', 'yes', 'moves_file'),
      wire('has_moves', 'else', 'none'),
      wire('moves_file', 'out', 'need_crew'),
      wire('need_crew', 'yes', 'warn'),
      wire('need_crew', 'else', 'ok'),
    ],
  );
}

// ── 4) 내 결재 대기 정리 ──
function approvalsDigest(): AgentGraph {
  return graph(
    [
      node('start', 'trigger', '수동 실행', { kind: 'manual' }),
      node('guard', 'guardrail', '읽기 전용', {
        rules: [
          { kind: 'allowTools', list: ['erp_approvals_list', 'create_report_file'] },
          { kind: 'maxLlmCalls', value: 1 },
          { kind: 'piiMask' },
        ],
      }),
      node('todo', 'tool', '내 결재 대기', {
        tool: 'erp_approvals_list',
        args: { box: 'todo' },
        outputVar: 'todo',
      }),
      node('has_todo', 'branch', '대기 문서 있나?', {
        mode: 'condition',
        cases: [{ id: 'yes', label: '있음', expr: 'len(todo) > 0', description: '' }],
      }),
      node('triage', 'llm', '우선순위 정리', {
        model: 'claude-haiku-5-5',
        effort: 'low',
        instructions: [
          '당신은 통인익스프레스(이사·리빙케어) 결재자의 비서입니다. 결재 대기 문서 목록을 보고 먼저 볼 순서를 정리합니다.',
          '- 결재 기한·이사 일정·금액·고객 영향이 큰 문서를 앞에 둡니다. 오래 기다린 문서(올린 날짜가 이른 것)도 앞쪽에.',
          '- 문서마다 한 줄: "문서번호 · 종류 · 제목 — 먼저 볼 이유". 최대 10줄, 한국어 불릿.',
          '- 승인·반려를 대신 결정하지 않습니다. 목록에 없는 내용은 지어내지 않습니다.',
        ].join('\n'),
        prompt: '오늘: {{run.today}}\n결재 대기 문서: {{todo}}',
        outputFormat: 'text',
        outputVar: 'triage',
      }),
      reportFile(
        'todo_file',
        '대기 목록 엑셀',
        {
          title: '결재 대기 문서',
          note: '{{run.today}} 기준, 내가 결재할 차례인 문서',
          columns: ['문서번호', '종류', '제목', '기안자', '기안 부서', '올린 시각'],
          fields: [
            'docNo',
            'docTypeLabel',
            'title',
            'requester.name',
            'requester.orgUnitName',
            'submittedAt',
          ],
          rows: '{{todo}}',
        },
        'todoFile',
      ),
      node('out', 'output', '정리 결과', {
        template: [
          '## 결재 대기 {{todo.length}}건 ({{run.today}})',
          '{{triage}}',
          '',
          '결재는 전자결재 화면에서 직접 해 주세요. 목록: {{todoFile.fileName}}',
        ].join('\n'),
      }),
      node('none', 'output', '대기 없음', { template: '지금 결재할 차례인 문서가 없습니다.' }),
    ],
    [
      wire('start', 'out', 'guard'),
      wire('guard', 'out', 'todo'),
      wire('todo', 'out', 'has_todo'),
      wire('has_todo', 'yes', 'triage'),
      wire('has_todo', 'else', 'none'),
      wire('triage', 'out', 'todo_file'),
      wire('todo_file', 'out', 'out'),
    ],
  );
}

// ── 5) 이사 전날 안내 문자 ──
const EVE_SMS =
  '[통인익스프레스] {고객명}님, 내일 이사 예정입니다. 작업팀이 출발 전에 연락드리며, ' +
  '귀중품·현금·중요 서류는 미리 따로 챙겨 주세요. 변경 사항은 담당자에게 알려 주세요.';

function moveEveSms(): AgentGraph {
  return graph(
    [
      node('start', 'trigger', '매일 오후 5시', { kind: 'schedule', cron: '0 17 * * *' }),
      node('guard', 'guardrail', '발송 가드레일', {
        rules: [
          { kind: 'maxRecipients', value: 50 },
          { kind: 'allowTools', list: ['search_leads', 'send_sms'] },
          { kind: 'timeWindow', startHour: 9, endHour: 20, weekdays: [0, 1, 2, 3, 4, 5, 6] },
        ],
      }),
      node('tomorrow', 'tool', '내일 이사 고객', {
        tool: 'search_leads',
        args: {
          statuses: '["CONTRACTED","WORK_TOSS"]',
          dateField: 'moveDate',
          from: '{{run.tomorrow}}',
          to: '{{run.tomorrow}}',
          limit: '50',
        },
        outputVar: 'moves',
      }),
      node('has_moves', 'branch', '대상이 있나?', {
        mode: 'condition',
        cases: [{ id: 'yes', label: '있음', expr: 'moves.total > 0', description: '' }],
      }),
      node('approve', 'approval', '발송 승인', {
        message:
          '내일({{run.tomorrow}}) 이사 고객 {{moves.returned}}명에게 아래 안내 문자를 보낼까요?\n' +
          `지점: {{moves.rows[*].orgUnit}}\n\n${EVE_SMS}`,
      }),
      node('send', 'tool', '안내 문자 발송', {
        tool: 'send_sms',
        args: {
          customerIds: '{{moves.rows[*].customerId}}',
          message: EVE_SMS,
          purpose: '이사 전날 안내(에이전트)',
        },
        outputVar: 'sent',
      }),
      node('done', 'output', '발송 결과', {
        template:
          '내일 이사 고객 {{moves.returned}}명 중 {{sent.sent}}명에게 안내 문자를 보냈습니다.',
      }),
      node('none', 'output', '대상 없음', {
        template: '내일({{run.tomorrow}}) 잡힌 이사가 없어 문자를 보내지 않았습니다.',
      }),
      node('canceled', 'output', '발송 취소', { template: '담당자가 발송을 승인하지 않았습니다.' }),
    ],
    [
      wire('start', 'out', 'guard'),
      wire('guard', 'out', 'tomorrow'),
      wire('tomorrow', 'out', 'has_moves'),
      wire('has_moves', 'yes', 'approve'),
      wire('has_moves', 'else', 'none'),
      wire('approve', 'approved', 'send'),
      wire('approve', 'rejected', 'canceled'),
      wire('send', 'out', 'done'),
    ],
  );
}

// ── 6) CS 티켓 긴급도 분류 ──
function csTriage(): AgentGraph {
  return graph(
    [
      node('start', 'trigger', '새 CS 티켓 시', { kind: 'event', event: 'support.created' }),
      node('guard', 'guardrail', '도구 제한', {
        rules: [
          {
            kind: 'allowTools',
            list: ['erp_support_tickets_find_one', 'erp_support_tickets_update'],
          },
          { kind: 'maxLlmCalls', value: 1 },
          { kind: 'piiMask' },
        ],
      }),
      node('ticket', 'tool', '티켓 조회', {
        tool: 'erp_support_tickets_find_one',
        args: { id: '{{input.event.id}}' },
        outputVar: 'ticket',
      }),
      node('classify', 'branch', '긴급도 분류', {
        mode: 'classify',
        input:
          '종류: {{ticket.kind}}\n채널: {{ticket.channel}}\n제목: {{ticket.subject}}\n내용: {{ticket.content}}',
        instructions:
          '이사·리빙케어 회사의 고객 CS·AS 티켓을 읽고 얼마나 급한지 분류합니다. 제목과 내용만 보고 판단합니다.',
        model: 'claude-haiku-5-5',
        outputVar: 'urgency',
        cases: [
          {
            id: 'urgent',
            label: '긴급',
            expr: '',
            description:
              '파손·분실·누수·안전 문제, 이사 당일·전날 문제(작업팀 미도착 등), 강한 불만·환불·소송 언급',
          },
          {
            id: 'normal',
            label: '보통',
            expr: '',
            description: '일정 변경·추가 작업·견적 문의 등 며칠 안에 처리하면 되는 요청',
          },
          {
            id: 'simple',
            label: '단순 문의',
            expr: '',
            description: '영수증·서류 요청, 안내 확인 등 단순 문의',
          },
        ],
      }),
      node('approve', 'approval', '우선순위 승인', {
        message:
          '티켓 {{ticket.ticketNo}}({{ticket.orgName}}) "{{ticket.subject}}"을(를) 긴급으로 분류했습니다. 우선순위를 높음으로 올릴까요?',
      }),
      node('raise', 'tool', '우선순위 높이기', {
        tool: 'erp_support_tickets_update',
        args: { id: '{{input.event.id}}', body: '{"priority":"HIGH"}' },
        outputVar: 'updated',
      }),
      node('urgent_out', 'output', '긴급 처리', {
        template:
          '⚠ 긴급 CS — {{ticket.ticketNo}} {{ticket.orgName}} "{{ticket.subject}}" 우선순위를 높음으로 올렸습니다. 바로 연락해 주세요.',
      }),
      node('kept', 'output', '긴급 보류', {
        template:
          '{{ticket.ticketNo}} "{{ticket.subject}}" — 긴급으로 분류됐지만 담당자가 우선순위 변경을 승인하지 않았습니다.',
      }),
      node('normal_out', 'output', '보통 처리', {
        template:
          '{{ticket.ticketNo}} {{ticket.orgName}} "{{ticket.subject}}" — 보통 건입니다. 평소 순서대로 처리해 주세요.',
      }),
      node('simple_out', 'output', '단순 문의', {
        template:
          '{{ticket.ticketNo}} "{{ticket.subject}}" — 단순 문의입니다. 상용구 답변으로 빠르게 끝낼 수 있습니다.',
      }),
      node('unknown', 'output', '분류 어려움', {
        template:
          '{{ticket.ticketNo}} "{{ticket.subject}}" — 자동 분류가 어려워 직접 확인이 필요합니다.',
      }),
    ],
    [
      wire('start', 'out', 'guard'),
      wire('guard', 'out', 'ticket'),
      wire('ticket', 'out', 'classify'),
      wire('classify', 'urgent', 'approve'),
      wire('classify', 'normal', 'normal_out'),
      wire('classify', 'simple', 'simple_out'),
      wire('classify', 'else', 'unknown'),
      wire('approve', 'approved', 'raise'),
      wire('approve', 'rejected', 'kept'),
      wire('raise', 'out', 'urgent_out'),
    ],
  );
}

export const MORE_BLUEPRINTS = [
  {
    n: 11,
    name: '고객관리부 주간 보고',
    description:
      '매주 월요일 지난주 지점별·경로별 접수와 계약, 미계약 명단, CS 티켓 현황을 엑셀 2개와 요약으로 정리합니다.',
    status: 'ACTIVE',
    prompt:
      '매주 월요일 고객관리부 주간 보고(지점·경로별 실적, 미계약, CS)를 엑셀로 만들어 주는 에이전트',
    graph: crmWeekly(),
  },
  {
    n: 12,
    name: '경영지원실 미수금·입금 현황',
    description:
      '매주 월요일 고객별 미수금, 이번 주 입금 내역, 7일 넘게 입금 안 된 요청을 엑셀로 뽑고 요약합니다.',
    status: 'ACTIVE',
    prompt: '매주 미수금과 입금 현황을 엑셀로 정리해 주는 경영지원실 에이전트',
    graph: receivablesWeekly(),
  },
  {
    n: 13,
    name: '이번 주 이사 일정·작업팀 점검',
    description:
      '매일 아침 앞으로 7일 이사 일정표를 만들고, 3일 안에 이사인데 작업팀 배정 전인 건을 알려 줍니다.',
    status: 'ACTIVE',
    prompt: '매일 아침 이번 주 이사 일정을 정리하고 작업팀 미배정 건을 알려 주는 에이전트',
    graph: movesCheck(),
  },
  {
    n: 14,
    name: '내 결재 대기 정리',
    description:
      '내가 결재할 차례인 문서를 모아 AI가 먼저 볼 순서를 정리하고 목록을 엑셀로 줍니다(결재는 직접).',
    status: 'ACTIVE',
    prompt: '내 결재 대기 문서를 모아 우선순위를 정리해 주는 에이전트',
    graph: approvalsDigest(),
  },
  {
    n: 15,
    name: '이사 전날 안내 문자',
    description:
      '매일 오후 내일 이사 고객을 찾아, 담당자 승인 후 정해진 안내 문구로 문자를 보냅니다(최대 50명).',
    status: 'DRAFT',
    prompt: '내일 이사하는 고객에게 전날 안내 문자를 보내는 에이전트',
    graph: moveEveSms(),
  },
  {
    n: 16,
    name: 'CS 티켓 긴급도 분류',
    description:
      '새 CS 티켓이 들어오면 AI가 긴급·보통·단순 문의로 분류하고, 긴급이면 승인 후 우선순위를 높입니다.',
    status: 'DRAFT',
    prompt: '새 CS 티켓의 긴급도를 분류하고 긴급 건 우선순위를 올리는 에이전트',
    graph: csTriage(),
  },
];

async function main() {
  // 구조 검사(도구 목록 없이) — 오류가 있으면 넣지 않는다
  for (const b of MORE_BLUEPRINTS) {
    const errors = validateAgentGraph(b.graph).filter((i) => i.level === 'error');
    if (errors.length)
      throw new Error(`'${b.name}' 그래프 오류: ${errors.map((e) => e.message).join(' / ')}`);
  }

  const admin = await prisma.appUser.findUnique({ where: { loginId: 'admin' } });
  let created = 0;
  for (const b of MORE_BLUEPRINTS) {
    const id = demoId(b.n);
    if (await prisma.agentBlueprint.findUnique({ where: { id }, select: { id: true } })) {
      console.log(`에이전트 '${b.name}' — 이미 있어 건너뜀`);
      continue;
    }
    await prisma.agentBlueprint.create({
      data: {
        id,
        name: b.name,
        description: b.description,
        status: b.status,
        graph: b.graph as object,
        prompt: b.prompt,
        // 시연 에이전트는 모든 직원이 AI 에이전트 화면에서 불러 볼 수 있게 전체 공개
        visibility: 'PUBLIC',
        createdBy: admin?.id ?? null,
      },
    });
    created++;
    console.log(
      `에이전트 '${b.name}' — 노드 ${b.graph.nodes.length}개 · 선 ${b.graph.edges.length}개`,
    );
  }
  console.log(
    `\n데모 에이전트 블루프린트 추가분 ${created}개 생성(전체 ${MORE_BLUEPRINTS.length}개)`,
  );
}

// 검사 스크립트가 MORE_BLUEPRINTS만 불러 쓸 수 있게, 직접 실행할 때만 DB에 넣는다
if (require.main === module) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => void prisma.$disconnect());
}
