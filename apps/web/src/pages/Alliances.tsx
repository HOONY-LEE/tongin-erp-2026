import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LEAD_STATUS_LABEL,
  PARTNER_CONTRACT_STATUSES,
  PARTNER_CONTRACT_STATUS_LABEL,
  type LeadStatus,
  type PartnerContractStatus,
} from '@tongin/shared';
import { useAuth } from '../auth/AuthContext';
import { api, ApiError } from '../lib/api';
import { useDetailParam, useTabParam } from '../lib/useDetailParam';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import { formatPhone } from '../lib/phone';
import {
  Badge,
  Button,
  DataTable,
  FormModal,
  ListPage,
  Modal,
  RecordDetail,
  SegmentedControl,
  Textarea,
  useToast,
  type Column,
  type FormField,
  type Row,
} from '../components/ui';
import styles from './franchise.module.css';

type Kind = 'AFFILIATE' | 'EXCLUSIVE';
interface Partner {
  id: string;
  code: string;
  type: Kind;
  name: string;
  phone: string | null;
  isActive: boolean;
  contractStatus: PartnerContractStatus | null;
  benefit: string | null;
  intake: string | null;
  memo: string | null;
  createdAt: string;
  leadCount: number;
  leadCountYear: number;
}
interface PartnerDetail extends Partner {
  recentLeads: {
    id: string;
    leadNo: string;
    status: string;
    createdAt: string;
    moveDate: string | null;
    orgUnit: { name: string } | null;
    customer: { name: string } | null;
  }[];
}

const KIND: Record<Kind, { label: string; move: string; scope: string; desc: string }> = {
  AFFILIATE: {
    label: '제휴',
    move: '제휴이사',
    scope: '본사·가맹점 배정',
    desc: '공제회·복지몰·기업 회원 등 제휴사 회원의 이사. 본사와 가맹점 모두 배정합니다.',
  },
  EXCLUSIVE: {
    label: '전속',
    move: '전속이사',
    scope: '본사에서만 배정',
    desc: '전속 계약을 맺은 회사 임직원의 이사. 본사에서만 배정합니다(지점에는 배정 불가).',
  },
};
const STATUS_COLOR: Record<PartnerContractStatus, 'success' | 'info' | 'primary' | 'neutral'> = {
  ACTIVE: 'success',
  AUTO_RENEW: 'info',
  NEW: 'primary',
  ENDED: 'neutral',
};
const ymd = (iso: string | null) => (iso ? iso.slice(0, 10) : '—');

function StatusBadge({ s }: { s: PartnerContractStatus | null }) {
  if (!s) return <span className={styles.muted}>—</span>;
  return (
    <Badge variant="subtle" color={STATUS_COLOR[s]} size="sm">
      {PARTNER_CONTRACT_STATUS_LABEL[s]}
    </Badge>
  );
}

/**
 * 제휴·전속 — 제휴사(회원 이사, 본사·가맹점 배정)와 전속 계약사(임직원 이사, 본사만 배정) 목록.
 * 접수에 업체를 걸면 제휴이사·전속이사로 구분되고, 전속이사는 지점으로 배정되지 않는다.
 * 작업을 맡기는 외주 용역업체(거래처관리의 '외주(작업)')와는 다르다.
 */
export default function Alliances() {
  const toast = useToast();
  const { can } = useAuth();
  const { tab: kind, setTab: setKind } = useTabParam<Kind>('AFFILIATE', 'kind');
  const detail = useDetailParam();
  const { updatedAt, touch } = useUpdatedAt();
  const [rows, setRows] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Partner | 'new' | null>(null);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<Partner[]>(`/partners?type=${kind}`));
      touch();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '불러오지 못했습니다' });
    } finally {
      setLoading(false);
    }
  }, [kind, toast, touch]);
  useEffect(() => {
    void load();
  }, [load]);

  const k = KIND[kind];
  const fields: FormField[] = [
    { name: 'name', label: '업체명', required: true, placeholder: '예: 경찰공제회' },
    {
      name: 'contractStatus',
      label: '계약 상태',
      type: 'chips',
      alwaysShow: true,
      options: PARTNER_CONTRACT_STATUSES.map((v) => ({
        value: v,
        label: PARTNER_CONTRACT_STATUS_LABEL[v],
      })),
    },
    {
      name: 'benefit',
      label: kind === 'AFFILIATE' ? '제휴 내용(대상·혜택·할인·할증)' : '전속 계약 내용',
      type: 'textarea',
      alwaysShow: true,
    },
    ...(kind === 'AFFILIATE'
      ? [
          {
            name: 'intake',
            label: '접수 방식',
            placeholder: '예: 어플(CS 연동), 온라인/전화접수',
            alwaysShow: true,
          } as FormField,
        ]
      : []),
    { name: 'phone', label: '담당자 연락처', type: 'tel', alwaysShow: true },
    { name: 'memo', label: '메모', type: 'textarea' },
    { name: 'isActive', label: '사용(접수에서 고를 수 있음)', type: 'boolean' },
  ];
  const save = async (v: Record<string, unknown>) => {
    const isNew = editing === 'new';
    const str = (key: string) => (v[key] === '' || v[key] == null ? null : String(v[key]));
    const body = {
      type: kind,
      name: String(v.name ?? '').trim(),
      contractStatus: str('contractStatus'),
      benefit: str('benefit'),
      intake: str('intake'),
      phone: str('phone') ?? undefined,
      memo: str('memo'),
      isActive: v.isActive === undefined ? true : v.isActive === true || v.isActive === 'true',
    };
    try {
      const r = await api<{ id: string }>(
        isNew ? '/partners' : `/partners/${(editing as Partner).id}`,
        { method: isNew ? 'POST' : 'PATCH', body: JSON.stringify(body) },
      );
      toast({ type: 'success', title: isNew ? `${k.label} 업체를 등록했습니다` : '저장했습니다' });
      setEditing(null);
      await load();
      if (isNew && r.id) detail.open(r.id);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '저장하지 못했습니다' });
      throw e;
    }
  };
  const initialOf = (p: Partner | 'new'): Record<string, string> =>
    p === 'new'
      ? { contractStatus: 'ACTIVE', isActive: 'true' }
      : {
          name: p.name,
          contractStatus: p.contractStatus ?? '',
          benefit: p.benefit ?? '',
          intake: p.intake ?? '',
          phone: p.phone ?? '',
          memo: p.memo ?? '',
          isActive: String(p.isActive),
        };
  const modal = (
    <FormModal
      open={editing !== null}
      onOpenChange={(o) => !o && setEditing(null)}
      title={editing === 'new' ? `${k.label} 업체 등록` : `${k.label} 업체 수정`}
      size="md"
      fields={fields}
      initialValues={editing ? initialOf(editing) : undefined}
      onSubmit={save}
    />
  );

  if (detail.id)
    return (
      <>
        <PartnerDetailView
          id={detail.id}
          onBack={detail.close}
          onEdit={(p) => setEditing(p)}
          onChanged={load}
        />
        {modal}
      </>
    );

  const active = rows.filter((r) => r.isActive && r.contractStatus !== 'ENDED');
  const year = rows.reduce((n, r) => n + r.leadCountYear, 0);
  const columns: Column[] = [
    {
      title: '번호',
      width: 104,
      render: (r) => <span className={styles.code}>{String(r.code)}</span>,
      exportValue: (r) => String(r.code),
    },
    { title: '업체명', dataIndex: 'name', width: 200 },
    {
      title: '상태',
      width: 92,
      render: (r) => (
        <>
          <StatusBadge s={r.contractStatus as PartnerContractStatus | null} />
          {!r.isActive && <span className={styles.muted}> · 사용 안 함</span>}
        </>
      ),
      exportValue: (r) =>
        r.contractStatus
          ? PARTNER_CONTRACT_STATUS_LABEL[r.contractStatus as PartnerContractStatus]
          : '',
    },
    {
      title: kind === 'AFFILIATE' ? '제휴 내용' : '계약 내용',
      flex: 1,
      minWidth: 260,
      render: (r) => (
        <span className={styles.clip2}>{(r.benefit as string | null)?.trim() || '—'}</span>
      ),
      exportValue: (r) => (r.benefit as string | null) ?? '',
    },
    ...(kind === 'AFFILIATE'
      ? [
          {
            title: '접수 방식',
            width: 150,
            render: (r: Row) => (
              <span className={styles.clip2}>{(r.intake as string | null)?.trim() || '—'}</span>
            ),
            exportValue: (r: Row) => (r.intake as string | null) ?? '',
          },
        ]
      : []),
    { title: '올해 접수', width: 84, render: (r) => `${r.leadCountYear as number}건` },
    { title: '전체 접수', width: 84, render: (r) => `${r.leadCount as number}건` },
  ];

  const actions = can('PARTNER.CREATE') ? (
    <>
      <Button variant="outline" size="sm" onClick={() => setImporting(true)}>
        가져오기
      </Button>
      <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
        + {k.label} 업체 등록
      </Button>
    </>
  ) : undefined;

  return (
    <ListPage
      fit
      title="제휴·전속"
      subtitle={`${KIND.AFFILIATE.desc} ${KIND.EXCLUSIVE.desc} 작업을 맡기는 외주 업체는 거래처관리에서 관리합니다.`}
      onRefresh={load}
      updatedAt={updatedAt}
      actions={
        <SegmentedControl
          value={kind}
          onChange={(v) => setKind(v as Kind)}
          options={[
            { value: 'AFFILIATE', label: '제휴' },
            { value: 'EXCLUSIVE', label: '전속' },
          ]}
        />
      }
    >
      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <span>{k.label} 업체</span>
          <b>{rows.length}</b>
          <small>
            진행·자동연장·신규 {active.length} · 종료·사용 안 함 {rows.length - active.length}
          </small>
        </div>
        <div className={styles.kpi}>
          <span>올해 {k.move} 접수</span>
          <b>{year}건</b>
          <small>업체를 건 접수 기준</small>
        </div>
        <div className={styles.kpi}>
          <span>배정</span>
          <b>{k.scope}</b>
          <small>
            {kind === 'EXCLUSIVE' ? '지점으로 배정하면 저장되지 않습니다' : '가맹점도 접수·배정'}
          </small>
        </div>
      </div>
      <DataTable
        fit
        columns={columns}
        rows={rows as unknown as Row[]}
        loading={loading}
        exportable
        exportFileName={`${k.label}업체`}
        toolbarActions={actions}
        onRowClick={(r) => detail.open(String(r.id))}
      />
      {modal}
      {importing && (
        <ImportModal
          kind={kind}
          onClose={() => setImporting(false)}
          onDone={() => {
            setImporting(false);
            void load();
          }}
        />
      )}
    </ListPage>
  );
}

function PartnerDetailView({
  id,
  onBack,
  onEdit,
  onChanged,
}: {
  id: string;
  onBack: () => void;
  onEdit: (p: Partner) => void;
  onChanged: () => Promise<void> | void;
}) {
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [d, setD] = useState<PartnerDetail | null>(null);
  useEffect(() => {
    void api<PartnerDetail>(`/partners/${id}/detail`)
      .then(setD)
      .catch((e) =>
        toast({ type: 'error', title: e instanceof ApiError ? e.message : '불러오지 못했습니다' }),
      );
  }, [id, toast]);
  const remove = async () => {
    if (!d || !window.confirm(`'${d.name}'을(를) 지울까요?`)) return;
    try {
      await api(`/partners/${id}`, { method: 'DELETE' });
      toast({ type: 'success', title: '지웠습니다' });
      await onChanged();
      onBack();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '지우지 못했습니다' });
    }
  };
  const k = d ? KIND[d.type] : null;
  return (
    <RecordDetail
      loading={!d}
      title={d?.name ?? ''}
      backLabel="제휴·전속"
      onBack={onBack}
      actions={
        d ? (
          <>
            {can('PARTNER.DELETE') && (
              <Button variant="ghost" size="sm" onClick={() => void remove()}>
                삭제
              </Button>
            )}
            {can('PARTNER.UPDATE') && (
              <Button variant="secondary" size="sm" onClick={() => onEdit(d)}>
                수정
              </Button>
            )}
          </>
        ) : undefined
      }
      sections={
        d && k
          ? [
              {
                title: '기본 정보',
                items: [
                  { label: '번호', value: d.code },
                  { label: '구분', value: `${k.label} · ${k.move}` },
                  { label: '계약 상태', value: <StatusBadge s={d.contractStatus} /> },
                  { label: '배정', value: k.scope },
                  ...(d.type === 'AFFILIATE' ? [{ label: '접수 방식', value: d.intake }] : []),
                  { label: '담당자 연락처', value: d.phone ? formatPhone(d.phone) : null },
                  {
                    label: '사용',
                    value: d.isActive ? '사용(접수에서 고를 수 있음)' : '사용 안 함',
                  },
                  { label: '접수', value: `전체 ${d.leadCount}건` },
                ],
              },
              {
                title: d.type === 'AFFILIATE' ? '제휴 내용' : '계약 내용',
                items: [
                  {
                    label: '내용',
                    value: d.benefit ? <p className={styles.pre}>{d.benefit}</p> : null,
                    wide: true,
                  },
                  { label: '메모', value: d.memo, wide: true },
                ],
              },
            ]
          : []
      }
    >
      {d && (
        <section className={styles.block}>
          <h3 className={styles.blockTitle}>최근 접수</h3>
          {d.recentLeads.length ? (
            <table className={styles.miniTable}>
              <thead>
                <tr>
                  <th>접수번호</th>
                  <th>고객</th>
                  <th>담당</th>
                  <th>상태</th>
                  <th>접수일</th>
                  <th>이사일</th>
                </tr>
              </thead>
              <tbody>
                {d.recentLeads.map((l) => (
                  <tr key={l.id} onClick={() => navigate(`/leads/${l.id}`)}>
                    <td>{l.leadNo}</td>
                    <td>{l.customer?.name ?? '—'}</td>
                    <td>{l.orgUnit?.name ?? '—'}</td>
                    <td>{LEAD_STATUS_LABEL[l.status as LeadStatus] ?? l.status}</td>
                    <td>{ymd(l.createdAt)}</td>
                    <td>{ymd(l.moveDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className={styles.muted}>
              아직 이 업체로 들어온 접수가 없습니다. 접수 등록에서 &lsquo;제휴·전속 업체&rsquo;를
              고르면 여기에 쌓입니다.
            </p>
          )}
        </section>
      )}
    </RecordDetail>
  );
}

/** 엑셀에서 표를 복사해 붙여넣기 — 머리글(업체명·상태·제휴내용·접수방식)로 칸을 맞춘다 */
function ImportModal({
  kind,
  onClose,
  onDone,
}: {
  kind: Kind;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(() => parseTable(text), [text]);
  const run = async () => {
    setBusy(true);
    try {
      const r = await api<{ created: number; skipped: number }>('/partners/import', {
        method: 'POST',
        body: JSON.stringify({ type: kind, rows: parsed.rows }),
      });
      toast({
        type: 'success',
        title: `${r.created}곳을 넣었습니다${r.skipped ? ` · 이미 있어 건너뜀 ${r.skipped}` : ''}`,
      });
      onDone();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '넣지 못했습니다' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${KIND[kind].label} 업체 가져오기`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!parsed.rows.length}
            onClick={() => void run()}
          >
            {parsed.rows.length}곳 넣기
          </Button>
        </>
      }
    >
      <div className={styles.importForm}>
        <p className={styles.muted}>
          엑셀에서 머리글 줄까지 표를 복사해 붙여넣으세요. 머리글 &lsquo;업체명&rsquo;(필수) ·
          &lsquo;상태&rsquo;(진행중·자동연장·신규·종료) · &lsquo;제휴내용&rsquo; ·
          &lsquo;접수방식&rsquo;을 봅니다. 같은 이름이 이미 있으면 건너뜁니다.
        </p>
        <Textarea
          rows={10}
          value={text}
          placeholder={'업체명\t상태\t제휴내용\n경찰공제회\t진행중\t이사비용 10~20% 할인'}
          onChange={(e) => setText(e.target.value)}
        />
        {parsed.error ? (
          <p className={styles.warn}>{parsed.error}</p>
        ) : (
          parsed.rows.length > 0 && (
            <div className={styles.importTable}>
              <table>
                <thead>
                  <tr>
                    <th>업체명</th>
                    <th>상태</th>
                    <th>내용</th>
                    <th>접수 방식</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 200).map((r, i) => (
                    <tr key={i}>
                      <td>{r.name}</td>
                      <td>{r.status || '—'}</td>
                      <td>{(r.benefit ?? '').slice(0, 60) || '—'}</td>
                      <td>{r.intake || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </Modal>
  );
}

/** 탭으로 나뉜 표(엑셀 복사) — 따옴표로 묶인 칸 안의 줄바꿈도 읽는다 */
function parseTable(text: string): {
  rows: { name: string; status?: string; benefit?: string; intake?: string }[];
  error?: string;
} {
  if (!text.trim()) return { rows: [] };
  const cells: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"' && cur === '') q = true;
    else if (c === '\t') {
      row.push(cur);
      cur = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur);
      cells.push(row);
      row = [];
      cur = '';
    } else cur += c;
  }
  if (cur || row.length) {
    row.push(cur);
    cells.push(row);
  }
  const norm = (s: string) => s.replace(/\s/g, '');
  const headerAt = cells.findIndex((r) => r.some((c) => /업체명|회사명|제휴사/.test(norm(c))));
  if (headerAt < 0) return { rows: [], error: "머리글 줄에 '업체명' 칸이 있어야 합니다." };
  const h = cells[headerAt].map(norm);
  const col = (...names: string[]) => h.findIndex((x) => names.some((n) => x.includes(n)));
  const ni = col('업체명', '회사명', '제휴사');
  const si = col('상태');
  const bi = col('제휴내용', '내용', '혜택');
  const ii = col('접수방식', '무빙', '접수');
  const rows = cells
    .slice(headerAt + 1)
    .map((r) => ({
      name: (r[ni] ?? '').replace(/\s+/g, ' ').trim(),
      status: si >= 0 ? r[si]?.trim() : undefined,
      benefit: bi >= 0 ? r[bi]?.trim() : undefined,
      intake: ii >= 0 ? r[ii]?.replace(/\*?\s*접수방식\s*:\s*/, '').trim() : undefined,
    }))
    .filter((r) => r.name && !/^(업체명|no)$/i.test(r.name));
  return { rows };
}
