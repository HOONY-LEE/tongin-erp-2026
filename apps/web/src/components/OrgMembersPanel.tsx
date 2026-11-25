import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { fmtDate } from '../lib/dateFormat';
import { Badge, DataTable, type Column, type Row } from './ui';

interface Member {
  id: string;
  name: string;
  empNo: string | null;
  position: string | null;
  hireDate: string | null;
  email: string | null;
  isHead: boolean;
}

/** 조직 상세 — 이 조직 직원(조직장 먼저). 누르면 직원 상세 */
export function OrgMembersPanel({ orgId }: { orgId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Member[] | null>(null);
  useEffect(() => {
    let alive = true;
    setRows(null);
    api<Member[]>(`/org-units/${orgId}/members`)
      .then((r) => alive && setRows(r))
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [orgId]);

  const columns: Column[] = [
    {
      title: t('misc.name'),
      dataIndex: 'name',
      flex: 1,
      minWidth: 140,
      render: (r) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {String(r.name)}
          {r.isHead ? (
            <Badge variant="subtle" color="primary">
              {t('misc.org.head')}
            </Badge>
          ) : null}
        </span>
      ),
    },
    {
      title: t('misc.org.position'),
      dataIndex: 'position',
      width: 110,
      render: (r) => String(r.position ?? '-'),
    },
    {
      title: t('misc.org.empNo'),
      dataIndex: 'empNo',
      width: 120,
      render: (r) => <span className="id-mono">{String(r.empNo ?? '-')}</span>,
    },
    {
      title: t('misc.org.hireDate'),
      dataIndex: 'hireDate',
      width: 120,
      render: (r) => (r.hireDate ? fmtDate(String(r.hireDate)) : '-'),
    },
    {
      title: t('misc.org.email'),
      dataIndex: 'email',
      minWidth: 160,
      render: (r) => String(r.email ?? '-'),
    },
  ];

  return (
    <section className="rd-card">
      <h3 className="rd-title">
        {t('misc.org.memberList')}
        {rows ? (
          <span
            style={{ marginLeft: 6, color: 'var(--ark-color-text-secondary)', fontWeight: 400 }}
          >
            {t('misc.org.memberN', { v0: rows.length })}
          </span>
        ) : null}
      </h3>
      <DataTable
        bare
        noFooter
        pageSize={0}
        loading={rows === null}
        columns={columns}
        rows={(rows ?? []) as unknown as Row[]}
        onRowClick={(r) => navigate(`/org-mgmt?tab=emp&detail=${String(r.id)}`)}
      />
    </section>
  );
}
