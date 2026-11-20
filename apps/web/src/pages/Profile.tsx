import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Camera, KeyRound, Pencil } from 'lucide-react';
import { EMPLOYMENT_TYPE_LABEL, type EmploymentType } from '@tongin/shared';
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
      setError(e instanceof ApiError ? e.message : '프로필을 불러오지 못했습니다');
    }
  }, [id]);
  useEffect(() => {
    setP(null);
    void load();
  }, [load]);

  if (!id)
    return (
      <>
        <PageHeader title="프로필" />
        <p style={{ color: 'var(--ark-color-text-secondary)' }}>
          직원과 연결된 계정이 아니라 프로필이 없습니다.
        </p>
      </>
    );
  if (error)
    return (
      <>
        <PageHeader title="프로필" />
        <p style={{ color: 'var(--ark-color-text-secondary)' }}>{error}</p>
      </>
    );
  if (!p)
    return (
      <>
        <PageHeader title="프로필" />
        <Spinner size="md" />
      </>
    );

  const status = p.resignDate ? (
    <Badge variant="subtle" color="neutral">
      퇴사 {d10(p.resignDate)}
    </Badge>
  ) : (
    <Badge variant="subtle" color={p.isActive ? 'success' : 'neutral'}>
      {p.isActive ? '재직' : '비활성'}
    </Badge>
  );
  const showPrivate = p.addr !== undefined;
  // 프로필 항목 — 이름 · ID · 사번 · 입사일 · 고용 형태 · 연락처 · 직책 · 소속 · 상태 · 주소 · 이메일 · 메모 · 권한
  const items: { label: string; value: React.ReactNode; wide?: boolean }[] = [
    { label: '이름', value: p.name },
    {
      label: 'ID',
      value: p.loginIds.length
        ? p.loginIds.map((u) => `${u.loginId}${u.isActive ? '' : ' (로그인 막힘)'}`).join(', ')
        : '계정 없음',
    },
    { label: '사번', value: p.empNo },
    { label: '입사일', value: d10(p.hireDate) },
    {
      label: '고용 형태',
      value: EMPLOYMENT_TYPE_LABEL[p.employmentType] ?? p.employmentType,
    },
    { label: '연락처', value: p.phone ? formatPhone(p.phone) : null },
    { label: '직책', value: p.position?.name },
    { label: '소속', value: p.orgUnit?.name },
    { label: '상태', value: status },
    ...(showPrivate
      ? [
          {
            label: '주소',
            wide: true,
            value: p.addr
              ? `${p.addr}${p.addrDetail ? ` ${p.addrDetail}` : ''}${p.zipcode ? `(${p.zipcode})` : ''}`
              : null,
          },
        ]
      : []),
    { label: '이메일', value: p.email },
    ...(showPrivate ? [{ label: '메모', wide: true, value: p.memo }] : []),
    {
      label: '권한',
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
    { name: 'phone', label: '연락처', type: 'tel' },
    { name: 'email', label: '이메일' },
    { name: 'address', label: '주소', type: 'address', addrPrefix: '' },
  ];

  return (
    <>
      <PageHeader
        title={p.self ? '내 프로필' : `${p.name} 프로필`}
        actions={
          p.self ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setPwOpen(true)}>
                <KeyRound size={14} /> 비밀번호 변경
              </Button>
              <Button variant="primary" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil size={14} /> 수정
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
              aria-label="프로필 사진 바꾸기"
              title="프로필 사진 바꾸기"
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
            title="내 프로필 수정"
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
                toast({ type: 'success', title: '프로필을 고쳤습니다' });
              } catch (e) {
                toast({
                  type: 'error',
                  title: e instanceof ApiError ? e.message : '고치지 못했습니다',
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
              toast({ type: 'success', title: '프로필 사진을 바꿨습니다' });
            }}
          />
        </>
      )}
    </>
  );
}
