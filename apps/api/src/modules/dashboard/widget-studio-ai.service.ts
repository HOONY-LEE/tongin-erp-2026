import Anthropic from '@anthropic-ai/sdk';
import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  DASH_PERIODS,
  STUDIO_DATASETS,
  STUDIO_GRAINS,
  STUDIO_VIZ,
  normalizeStudioSpec,
  type StudioProposal,
  type StudioSpec,
} from '@tongin/shared';
import { trackClaude } from '../../ai/ai-usage.service';
import { resolveChatModel } from '../../ai/ai-models';

const SYSTEM = `당신은 통인익스프레스(이사·리빙·케어 회사) ERP의 대시보드 위젯 설계자입니다.
관리자가 자연어로 원하는 위젯을 말하면, 아래 데이터 카탈로그만 써서 위젯 설계서(spec)를 2~4개 제안합니다.
반드시 propose_widgets 도구로만 답합니다. 모든 글은 한국어로, 짧고 쉽게 씁니다.

설계서 규칙
- dataset·measure·dimension·split·filters.dim·periodField·controls의 값은 카탈로그의 key만 씁니다.
- dimension: 묶을 기준(없으면 숫자 하나). 시간 차원이면 grain(day·week·month·quarter·year)을 정합니다.
- split: 두 번째 기준(히트맵의 행). 보통은 비웁니다.
- viz 고르기(무엇을 보여 주나):
  · 비교: 항목 비교 → hbar·bar / 항목×두 번째 기준 → stacked(split 필요) / 자세한 숫자 → table
  · 구성(비중): 6개 이하 → donut·pie / 항목이 많은 비중 → treemap / 단계 → funnel
  · 추이(시간): 날짜 차원 → line·area·bar
  · 분포: 건마다의 값이 어떻게 퍼져 있나 → histogram(field 필요, 기준 없이) / 기준별 분포 비교 → box(field + dimension)
  · 관계: 기준별로 두 숫자의 관계 → scatter(measure=가로축, measure2=세로축, dimension 필요) / 두 기준 → heatmap(split 필요)
  · 지역: 출발지 시도(geo) → map / 숫자 하나 → card / 비율 하나 → gauge
- period: 7d·30d·90d·12m·all. 연간 비교면 12m 또는 all.
- controls(보는 사람이 누르는 요소, 최대 4개):
  · {kind:'segment', target:'grain', options:['week','month','year']} — 주간/월간/연간 탭
  · {kind:'segment' 또는 'dropdown', target:'dimension', options:[차원 key…]} — '지점별/상품별/지역별' 바꾸기
  · {kind:'segment', target:'measure', options:[측정값 key…]} — 매출/건수 바꾸기
  · {kind:'dropdown', target:'period', options:['30d','90d','12m']}
  · {kind:'filter', dim:'차원 key'} — 항목 골라 거르기(시간 차원은 안 됨)
  · place로 자리를 정합니다: title(제목 줄 오른쪽 — 작은 탭 하나일 때 깔끔), left(기본), right, bottom
- 권한·지점 범위는 서버가 자동으로 겁니다: 지점 직원은 자기 지점 데이터만 봅니다. 한 지점만 보는 사람에게는
  'org'(지점별) 선택지가 자동으로 숨겨집니다. 그래서 "본사는 지점별로도 보고 지점은 자기 것만"이면
  dimension 조작에 'org'를 넣으면 됩니다(따로 권한 조건을 만들 필요 없음).
- 계약(contract)은 상태를 따로 정하지 않으면 서명완료만, 입금(payment)은 입금완료만, 작업(work)은 취소 제외로 셉니다.
- title은 20자 안팎, subtitle은 무엇을 어떻게 세는지 한 줄.

제안 규칙
- 첫 번째가 추천안입니다. 나머지는 모양이나 조작 방식이 분명히 다른 대안으로 냅니다.
- why에는 이 안이 좋은 이유를 한두 문장으로.
- 카탈로그에 없는 데이터를 원하면 summary에 솔직히 말하고 가장 가까운 안을 냅니다.
- 꼭 필요한 것만 questions에 최대 2개(없으면 비움).
- 현재 설계서(current)가 주어지면 그것을 고쳐 달라는 뜻입니다 — 첫 안은 고친 설계서로.`;

const SPEC_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    subtitle: { type: 'string' },
    dataset: { type: 'string', enum: STUDIO_DATASETS.map((d) => d.key) },
    measure: { type: 'string' },
    measure2: { type: 'string', description: '산점도 세로축 측정값' },
    field: { type: 'string', description: '히스토그램·박스플롯의 건별 숫자 칸(catalog fields)' },
    dimension: { type: ['string', 'null'] },
    grain: { type: 'string', enum: [...STUDIO_GRAINS] },
    split: { type: ['string', 'null'] },
    viz: { type: 'string', enum: [...STUDIO_VIZ] },
    period: { type: 'string', enum: [...DASH_PERIODS] },
    periodField: { type: 'string' },
    filters: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          dim: { type: 'string' },
          values: { type: 'array', items: { type: 'string' } },
        },
        required: ['dim', 'values'],
      },
    },
    limit: { type: 'integer' },
    controls: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['segment', 'dropdown', 'filter'] },
          target: { type: 'string', enum: ['grain', 'dimension', 'measure', 'period', 'viz'] },
          dim: { type: 'string' },
          label: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          place: {
            type: 'string',
            enum: ['title', 'left', 'right', 'bottom'],
            description: '놓을 자리: 제목 줄·차트 위 왼쪽(기본)·차트 위 오른쪽·차트 아래',
          },
        },
        required: ['kind'],
      },
    },
  },
  required: ['title', 'dataset', 'measure', 'viz', 'period'],
} as const;

const TOOL = {
  name: 'propose_widgets',
  description: '위젯 설계서 제안 2~4개(첫 번째가 추천)',
  input_schema: {
    type: 'object' as const,
    properties: {
      summary: { type: 'string', description: '요청을 어떻게 이해했는지 한두 문장' },
      proposals: {
        type: 'array',
        minItems: 1,
        maxItems: 4,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '안 이름(예: 기간 탭 + 선 그래프)' },
            why: { type: 'string' },
            spec: SPEC_SCHEMA,
          },
          required: ['name', 'why', 'spec'],
        },
      },
      questions: { type: 'array', items: { type: 'string' }, maxItems: 2 },
    },
    required: ['summary', 'proposals'],
  },
};

/** 카탈로그를 AI가 읽기 좋게 */
const CATALOG = JSON.stringify(
  STUDIO_DATASETS.map((d) => ({
    key: d.key,
    label: d.label,
    description: d.description,
    measures: d.measures.map((m) => ({
      key: m.key,
      label: m.label,
      format: m.format,
      ...(m.description ? { note: m.description } : {}),
    })),
    dimensions: d.dimensions.map((x) => ({ key: x.key, label: x.label, kind: x.kind })),
    fields: d.fields.map((f) => ({ key: f.key, label: f.label, format: f.format })),
  })),
);

export interface StudioProposeResult {
  summary: string;
  proposals: StudioProposal[];
  questions: string[];
}

/** 위젯 스튜디오 — 자연어 요청을 위젯 설계서 제안으로 */
@Injectable()
export class WidgetStudioAiService {
  private readonly logger = new Logger('WidgetStudioAi');
  private readonly client: Anthropic | null;

  constructor() {
    const key = process.env.ANTHROPIC_API_KEY;
    const workspace = process.env.ANTHROPIC_WORKSPACE_ID;
    this.client = key
      ? new Anthropic({
          apiKey: key,
          ...(workspace ? { defaultHeaders: { 'anthropic-workspace-id': workspace } } : {}),
        })
      : null;
  }

  async propose(prompt: string, current?: StudioSpec | null): Promise<StudioProposeResult> {
    const client = this.client;
    if (!client) throw new ServiceUnavailableException('AI가 설정되지 않았습니다(API 키 없음).');
    const ask = prompt.trim();
    if (!ask) throw new BadRequestException('만들고 싶은 위젯을 적어 주세요.');
    const model = resolveChatModel();
    const user =
      `<catalog>\n${CATALOG}\n</catalog>\n` +
      (current ? `<current>\n${JSON.stringify(current)}\n</current>\n` : '') +
      `<request>\n${ask.slice(0, 2000)}\n</request>`;
    let res: Anthropic.Message;
    try {
      // AI 쪽 인증·한도 오류(401·429 등)가 '로그인이 필요합니다'로 보이지 않게 503으로 바꿔 알린다
      res = await trackClaude('WIDGET_STUDIO', model, () =>
        client.messages.create({
          model,
          max_tokens: 6000,
          thinking: { type: 'disabled' },
          system: SYSTEM,
          tools: [TOOL],
          tool_choice: { type: 'tool', name: TOOL.name },
          messages: [{ role: 'user', content: user }],
        }),
      );
    } catch (e) {
      // 사용 권한·월 한도(우리 쪽 검사)는 그대로 알린다
      if (e instanceof HttpException) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`위젯 제안 AI 호출 실패: ${msg.slice(0, 200)}`);
      const status = (e as { status?: number }).status;
      throw new ServiceUnavailableException(
        status === 401 || status === 403
          ? 'AI 키가 만료됐거나 잘못돼 AI를 쓸 수 없습니다. 관리자에게 AI 키 교체를 요청해 주세요.'
          : status === 429
            ? 'AI 사용량이 잠시 많습니다. 잠시 뒤 다시 시도해 주세요.'
            : 'AI 호출에 실패했습니다. 잠시 뒤 다시 시도해 주세요.',
      );
    }
    const block = res.content.find((b) => b.type === 'tool_use');
    if (!block || block.type !== 'tool_use') {
      this.logger.warn(`제안 없음: stop_reason=${res.stop_reason}`);
      throw new ServiceUnavailableException('AI가 제안을 만들지 못했습니다. 다시 시도해 주세요.');
    }
    const out = block.input as {
      summary?: unknown;
      proposals?: { name?: unknown; why?: unknown; spec?: unknown }[];
      questions?: unknown[];
    };
    const proposals = (Array.isArray(out.proposals) ? out.proposals : []).slice(0, 4).map((p) => ({
      name: String(p?.name ?? '').slice(0, 60) || '제안',
      why: String(p?.why ?? '').slice(0, 400),
      spec: normalizeStudioSpec(p?.spec).spec,
    }));
    if (!proposals.length)
      throw new ServiceUnavailableException('AI가 제안을 만들지 못했습니다. 다시 시도해 주세요.');
    return {
      summary: String(out.summary ?? '').slice(0, 600),
      proposals,
      questions: (Array.isArray(out.questions) ? out.questions : []).map(String).slice(0, 2),
    };
  }
}
