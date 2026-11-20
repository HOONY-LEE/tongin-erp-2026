import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Camera, KeyRound, Pencil } from 'lucide-react';
import { EMPLOYMENT_TYPE_LABEL, type EmploymentType } from '@tongin/shared';
import { codeLabel } from '../i18n';
import { Badge, Button, FormModal, PageHeader, Spinner, useToast } from '../components/ui';
import type { FormField } from '../components/ui/types';
import { EmployeeAvatar } from '../components/employee/EmployeeAvatar';
import { PhotoCropModal } from '../components/employee/PhotoCropModal';
import { PasswordChangeModal } from '../components/account/PasswordChangeModal';
import { useAuth } from '../auth/AuthContext';
import { api, ApiError } from '../lib/api';
import { formatPhone } from '../lib/phone';
import { primeEmployeePhoto } from '../lib/employeePhoto';
import styles from '../components/employee/employee.module.css';

interface ProfileData {
  id: string;
  name: string;
  empNo: string | null;
  hireDate: string | null;
  employmentType: EmploymentType;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  resignDate: string | null;
  photoAt: string | null;
  position: { name: string } | null;
  orgUnit: { name: string } | null;
  self: boolean;
  loginIds: { loginId: string; isActive: boolean }[];
  roles: string[];
  /** 본인·인사 열람 권한일 때만 */
  zipcode?: string | null;
  addr?: string | null;
  addrDetail?: string | null;
  memo?: string | null;
}

const d10 = (v: string | null) => (v ? v.slice(0, 10) : null);

/**
 * 프로필 — 누구나 볼 수 있는 직원 정보 페이지(/profile = 내 프로필, /profile/:id = 그 직원).
 * 내 프로필이면 오른쪽 위에 '비밀번호 변경'·'수정'(연락처·이메일·주소), 사진도 바꿀 수 있다.
 */
export default function Profile() {
  const { id: paramId } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const { t } = useTranslation();
  const id = paramId ?? user?.employeeId ?? null;
  const [p, setP] = useState<ProfileData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setP(await api<ProfileData>(`/employees/${id}/profile`));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('profile.loadFailed'));
    }
  }, [id, t]);
  useEffect(() => {
    setP(null);
    void load();
  }, [load]);

  if (!id)
    return (
      <>
        <PageHeader title={t('profile.title')} />
        <p style={{ color: 'var(--ark-color-text-secondary)' }}>{t('profile.noEmployee')}</p>
      </>
    );
  if (error)
    return (
      <>
        <PageHeader title={t('profile.title')} />
        <p style={{ color: 'var(--ark-color-text-secondary)' }}>{error}</p>
      </>
    );
  if (!p)
    return (
      <>
        <PageHeader title={t('profile.title')} />
        <Spinner size="md" />
      </>
    );

  const status = p.resignDate ? (
    <Badge variant="subtle" color="neutral">
      {t('profile.resigned', { date: d10(p.resignDate) ?? '' })}
    </Badge>
  ) : (
    <Badge variant="subtle" color={p.isActive ? 'success' : 'neutral'}>
      {p.isActive ? t('profile.active') : t('profile.inactive')}
    </Badge>
  );
  const showPrivate = p.addr !== undefined;
  // 프로필 항목 — 이름 · ID · 사번 · 입사일 · 고용 형태 · 연락처 · 직책 · 소속 · 상태 · 주소 · 이메일 · 메모 · 권한
  const items: { label: string; value: React.ReactNode; wide?: boolean }[] = [
    { label: t('profile.f.name'), value: p.name },
    {
      label: t('profile.f.id'),
      value: p.loginIds.length
        ? p.loginIds
            .map((u) => `${u.loginId}${u.isActive ? '' : t('profile.loginBlocked')}`)
            .join(', ')
        : t('profile.noAccount'),
    },
    { label: t('profile.f.empNo'), value: p.empNo },
    { label: t('profile.f.hireDate'), value: d10(p.hireDate) },
    {
      label: t('profile.f.employmentType'),
      value: codeLabel('employmentType', p.employmentType, EMPLOYMENT_TYPE_LABEL),
    },
    { label: t('profile.f.phone'), value: p.phone ? formatPhone(p.phone) : null },
    { label: t('profile.f.position'), value: p.position?.name },
    { label: t('profile.f.orgUnit'), value: p.orgUnit?.name },
    { label: t('profile.f.status'), value: status },
    ...(showPrivate
      ? [
          {
            label: t('profile.f.address'),
            wide: true,
            value: p.addr
              ? `${p.addr}${p.addrDetail ? ` ${p.addrDetail}` : ''}${p.zipcode ? `(${p.zipcode})` : ''}`
              : null,
          },
        ]
      : []),
    { label: t('profile.f.email'), value: p.email },
    ...(showPrivate ? [{ label: t('profile.f.memo'), wide: true, value: p.memo }] : []),
    {
      label: t('profile.f.roles'),
      wide: true,
      value: p.roles.length ? (
        <span className={styles.roles}>
          {p.roles.map((r) => (
            <Badge key={r} variant="subtle" color="neutral">
              {r}
            </Badge>
          ))}
        </span>
      ) : null,
    },
  ];

  const editFields: FormField[] = [
    { name: 'phone', label: t('profile.f.phone'), type: 'tel' },
    { name: 'email', label: t('profile.f.email') },
    { name: 'address', label: t('profile.f.address'), type: 'address', addrPrefix: '' },
  ];

  return (
    <>
      <PageHeader
        title={p.self ? t('profile.mine') : t('profile.ofName', { name: p.name })}
        actions={
          p.self ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setPwOpen(true)}>
                <KeyRound size={14} /> {t('profile.changePw')}
              </Button>
              <Button variant="primary" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil size={14} /> {t('profile.edit')}
              </Button>
            </>
          ) : undefined
        }
      />
      <section className={`rd-card ${styles.profile}`}>
        <div className={styles.photoWrap}>
          <EmployeeAvatar id={p.id} name={p.name} photoAt={p.photoAt} size={88} />
          {p.self && (
            <button
              type="button"
              className={styles.photoEdit}
              onClick={() => setCropOpen(true)}
              aria-label={t('profile.changePhoto')}
              title={t('profile.changePhoto')}
            >
              <Camera size={14} />
            </button>
          )}
        </div>
        <div className={styles.profileText}>
          <b>
            {p.name} {status}
          </b>
          <span>{[p.position?.name, p.orgUnit?.name].filter(Boolean).join(' · ') || '-'}</span>
        </div>
      </section>
      <section className="rd-card" style={{ marginTop: 16 }}>
        <dl className="rd-grid">
          {items.map((it) => (
            <div key={it.label} className={`rd-item${it.wide ? ' rd-wide' : ''}`}>
              <dt>{it.label}</dt>
              <dd>
                {it.value === null || it.value === undefined || it.value === '' ? (
                  <span className="rd-empty">-</span>
                ) : (
                  it.value
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {p.self && (
        <>
          <FormModal
            open={editOpen}
            onOpenChange={setEditOpen}
            title={t('profile.editTitle')}
            size="sm"
            fields={editFields}
            initialValues={{
              phone: p.phone ?? '',
              email: p.email ?? '',
              zipcode: p.zipcode ?? '',
              addr: p.addr ?? '',
              addrDetail: p.addrDetail ?? '',
            }}
            onSubmit={async (v) => {
              try {
                setP(
                  await api<ProfileData>(`/employees/${p.id}/profile`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                      phone: v.phone ?? null,
                      email: v.email ?? null,
                      zipcode: v.zipcode ?? null,
                      addr: v.addr ?? null,
                      addrDetail: v.addrDetail ?? null,
                    }),
                  }),
                );
                toast({ type: 'success', title: t('profile.saved') });
              } catch (e) {
                toast({
                  type: 'error',
                  title: e instanceof ApiError ? e.message : t('profile.saveFailed'),
                });
                throw e;
              }
            }}
          />
          <PasswordChangeModal open={pwOpen} onClose={() => setPwOpen(false)} />
          <PhotoCropModal
            open={cropOpen}
            onClose={() => setCropOpen(false)}
            onSave={async (data, previewUrl) => {
              const r = await api<{ photoAt: string }>(`/employees/${p.id}/photo`, {
                method: 'PUT',
                body: JSON.stringify({ data }),
              });
              primeEmployeePhoto(p.id, r.photoAt, previewUrl);
              setP((cur) => (cur ? { ...cur, photoAt: r.photoAt } : cur));
              toast({ type: 'success', title: t('profile.photoSaved') });
            }}
          />
        </>
      )}
    </>
  );
}
