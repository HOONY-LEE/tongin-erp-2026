import i18n from '../../i18n';
import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../../lib/api';
import { formatPhone } from '../../lib/phone';
import { Badge, Button, SearchInput } from '../ui';
import styles from '../../pages/campaign.module.css';

interface Row {
  id: string;
  name: string;
  phone: string;
  addr: string | null;
  orgUnit: string | null;
}

/** 고객이 아닌 받는 사람 — 직원·직접 입력(시연 번호) */
export interface OtherRecipient {
  kind: 'EMPLOYEE' | 'EXTRA';
  /** 직원 id 또는 번호(숫자만) */
  key: string;
  name: string;
  phone: string;
  orgUnit: string | null;
}

const SIZE = 20;
const KIND_BADGE = {
  CUSTOMER: { label: i18n.t('camp.kind.CUSTOMER'), color: 'neutral' },
  EMPLOYEE: { label: i18n.t('camp.kind.EMPLOYEE'), color: 'info' },
  EXTRA: { label: i18n.t('camp.kind.EXTRA'), color: 'primary' },
} as const;

function KindBadge({ kind }: { kind: keyof typeof KIND_BADGE }) {
  const k = KIND_BADGE[kind];
  return (
    <Badge variant="subtle" color={k.color}>
      {k.label}
    </Badge>
  );
}

/**
 * 최종 발송 명단 — 담은 사람을 한눈에 보고, 이름·전화번호로 찾아 빼낼 수 있다.
 * '검색 결과 전체 담기'로 넣은 사람도 서버에서 이름·번호를 다시 읽어 보여 준다.
 * 직원·직접 입력한 번호는 맨 위에(구분 배지와 함께) 보여 준다.
 */
export function PickedList({
  ids,
  onRemove,
  others = [],
  onRemoveOther,
  readOnly,
}: {
  ids: string[];
  onRemove?: (id: string) => void;
  others?: OtherRecipient[];
  onRemoveOther?: (o: OtherRecipient) => void;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const [keyword, setKeyword] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; rows: Row[] } | null>(null);
  // 명단이 바뀔 때마다(담기·빼기) 다시 읽는다 — 순서와 상관없이 같은 명단이면 같은 키
  const key = useMemo(() => [...ids].sort().join(','), [ids]);

  // 입력하는 동안은 잠깐 기다렸다가 찾는다
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(keyword.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [keyword]);

  useEffect(() => {
    if (!ids.length) {
      setData({ total: 0, rows: [] });
      return;
    }
    let alive = true;
    api<{ total: number; rows: Row[] }>('/campaigns/audience', {
      method: 'POST',
      body: JSON.stringify({ ids, keyword: q || undefined, page, pageSize: SIZE }),
    })
      .then((r) => alive && setData(r))
      .catch(() => alive && setData({ total: 0, rows: [] }));
    return () => {
      alive = false;
    };
    // ids는 key로 비교한다(같은 명단이면 다시 읽지 않게)
  }, [key, q, page]);

  // 직원·직접 입력은 몇 명 안 되니 화면에서 바로 거른다(전화번호는 숫자만 비교)
  const shownOthers = useMemo(() => {
    if (!q) return others;
    const d = q.replace(/\D/g, '');
    return others.filter(
      (o) => o.name.includes(q) || (d.length >= 3 && o.phone.replace(/\D/g, '').includes(d)),
    );
  }, [others, q]);
  const totalCount = ids.length + others.length;

  // 마지막 페이지의 사람을 다 빼면 앞 페이지로
  useEffect(() => {
    if (data && data.rows.length === 0 && page > 1) setPage((p) => p - 1);
  }, [data, page]);

  return (
    <div className={styles.picked}>
      <div className={styles.pickedHead}>
        <b>{t('camp.finalList')}</b>
        <span className={styles.sub}>
          {totalCount.toLocaleString()}
          {t('camp.peopleSuffix')}
          {others.length > 0 &&
            t('camp.listBreakdown', { v0: ids.length.toLocaleString(), v1: others.length })}
        </span>
        <span style={{ flex: 1 }} />
        <div className={styles.pickedSearch}>
          <SearchInput
            value={keyword}
            onChange={setKeyword}
            placeholder={t('camp.listSearchPh')}
            ariaLabel={t('camp.listSearch')}
          />
        </div>
      </div>
      {totalCount === 0 ? (
        <div className={styles.pickedEmpty}>
          {t('camp.emptyList1')} t('camp.addAllShort'){t('camp.emptyList2')}
        </div>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th style={{ width: 56 }}>{t('camp.col.kind')}</th>
                  <th>{t('camp.col.name')}</th>
                  <th>{t('camp.col.phone')}</th>
                  <th>{t('camp.col.address')}</th>
                  <th>{t('camp.col.branch')}</th>
                  {!readOnly && <th style={{ width: 60 }} />}
                </tr>
              </thead>
              <tbody>
                {page === 1 &&
                  shownOthers.map((o) => (
                    <tr key={`${o.kind}:${o.key}`}>
                      <td>
                        <KindBadge kind={o.kind} />
                      </td>
                      <td>{o.name}</td>
                      <td>{formatPhone(o.phone)}</td>
                      <td className={styles.cellAddr}>-</td>
                      <td>{o.orgUnit ?? '-'}</td>
                      {!readOnly && (
                        <td>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={t('camp.removeOf', { v0: o.name })}
                            title={t('camp.removeFromList')}
                            onClick={() => onRemoveOther?.(o)}
                          >
                            <X size={14} />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                {(ids.length ? (data?.rows ?? []) : []).map((r) => (
                  <tr key={r.id}>
                    <td>
                      <KindBadge kind="CUSTOMER" />
                    </td>
                    <td>{r.name}</td>
                    <td>{r.phone ? formatPhone(r.phone) : '-'}</td>
                    <td className={styles.cellAddr}>{r.addr ?? '-'}</td>
                    <td>{r.orgUnit ?? '-'}</td>
                    {!readOnly && (
                      <td>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={t('camp.removeOf', { v0: r.name })}
                          title={t('camp.removeFromList')}
                          onClick={() => onRemove?.(r.id)}
                        >
                          <X size={14} />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
                {data && data.rows.length === 0 && shownOthers.length === 0 && (
                  <tr>
                    <td colSpan={readOnly ? 5 : 6} className={styles.sub}>
                      {t('camp.noMatchIn1')} '{q}'{t('camp.noMatchIn2')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {data && data.total > SIZE && (
            <div className={styles.pager}>
              <span>
                {data.total.toLocaleString()}
                {t('camp.ofPeople')} {(page - 1) * SIZE + 1}–{Math.min(page * SIZE, data.total)}
              </span>
              <div className={styles.inline}>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  {t('camp.prev')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page * SIZE >= data.total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t('camp.next')}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
