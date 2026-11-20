import i18n from '../i18n';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check, Copy, Download, Eraser } from 'lucide-react';
import { Button, Checkbox, Input, Skeleton } from '../components/ui';
import { SERVICE_UNAVAILABLE, toApiError } from '../lib/api';
import styles from './publicSign.module.css';

interface View {
  customerName: string;
  estimateNo: string;
  contractNo: string;
  totalAmount: number;
  depositAmount: number;
  balanceAmount: number;
  vatIncluded: boolean;
  signed: boolean;
  signedAt: string | null;
  signerName: string | null;
  deposit: {
    account: string | null;
    holder: string;
    paid: boolean;
    paidAt: string | null;
    dueAt: string | null;
  } | null;
}

const won = (v: number) => i18n.t('sign.won', { v0: Math.round(v).toLocaleString('ko-KR') });
const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('ko-KR', {
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

/** 공개 API — 로그인 토큰을 붙이지 않는다(고객 휴대폰에서 열리는 화면) */
async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/public/sign/${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    throw new Error(SERVICE_UNAVAILABLE);
  }
  if (!res.ok) throw await toApiError(res, `/public/sign/${path}`);
  return (await res.json().catch(() => ({}))) as T;
}

/** 서명 칸 — 손가락·마우스로 그린다(포인터 이벤트) */
function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const drawn = useRef(false);
  const [ink, setInk] = useState(false);

  useLayoutEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    const { width, height } = c.getBoundingClientRect();
    c.width = width * ratio;
    c.height = height * ratio;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111827';
  }, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const clear = () => {
    const c = ref.current;
    if (!c) return;
    c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
    drawn.current = false;
    setInk(false);
    onChange(null);
  };

  return (
    <div className={styles.padWrap}>
      <canvas
        ref={ref}
        className={styles.pad}
        aria-label={t('sign.pad')}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          const ctx = e.currentTarget.getContext('2d');
          const p = pos(e);
          ctx?.beginPath();
          ctx?.moveTo(p.x, p.y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = e.currentTarget.getContext('2d');
          const p = pos(e);
          ctx?.lineTo(p.x, p.y);
          ctx?.stroke();
          drawn.current = true;
        }}
        onPointerUp={(e) => {
          drawing.current = false;
          if (!drawn.current) return;
          setInk(true);
          onChange(e.currentTarget.toDataURL('image/png'));
        }}
      />
      {!ink && <span className={styles.padHint}>{t('sign.signHere')}</span>}
      <button type="button" className={styles.padClear} onClick={clear}>
        <Eraser size={14} /> {t('sign.clear')}
      </button>
    </div>
  );
}

/** 견적서 미리보기 — A4 문서를 화면 폭에 맞춰 줄여 보여 준다 */
function DocPreview({ src }: { src: string }) {
  const { t } = useTranslation();
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, el.clientWidth / 820));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // A4 2쪽 + 여백(문서 안 회색 바탕·툴바 포함)
  const W = 820;
  const H = 2 * 1123 + 120;
  return (
    <div ref={box} className={styles.docBox} style={{ height: H * scale }}>
      <iframe
        title={t('sign.estimate')}
        src={src}
        className={styles.doc}
        style={{ width: W, height: H, transform: `scale(${scale})` }}
      />
    </div>
  );
}

/**
 * 고객 서명 페이지(/s/:token) — 문자로 받은 링크. 로그인 없이 견적서를 보고, PDF로 저장하고,
 * 약관에 동의해 서명한다. 계약금 계좌도 여기서 다시 확인할 수 있다.
 */
export default function PublicSign() {
  const { t } = useTranslation();
  const { token = '' } = useParams<{ token: string }>();
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [agree, setAgree] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [docVer, setDocVer] = useState(0);

  const load = useCallback(async () => {
    try {
      const v = await call<View>(encodeURIComponent(token));
      setView(v);
      setName((n) => n || v.customerName);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('sign.openFailed'));
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  // 입금을 기다리는 동안에는 가끔 다시 확인해 '입금 확인됨'을 바로 보여 준다
  useEffect(() => {
    if (!view?.deposit || view.deposit.paid) return;
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, [view, load]);

  const docSrc = `/api/public/sign/${encodeURIComponent(token)}/document?v=${docVer}`;

  // 서명·이름·동의가 모두 있어야 서명하기 버튼 활성
  const canSubmit = !!signature && !!name.trim() && agree;

  const submit = async () => {
    if (!signature) return setError(t('sign.drawReq'));
    if (!name.trim()) return setError(t('sign.nameReq'));
    if (!agree) return setError(t('sign.agreeReq'));
    setBusy(true);
    setError(null);
    try {
      const v = await call<View>(encodeURIComponent(token), {
        method: 'POST',
        body: JSON.stringify({ signature, signerName: name.trim(), agree }),
      });
      setView(v);
      setDocVer((x) => x + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('sign.signFailed'));
    } finally {
      setBusy(false);
    }
  };

  if (!view) {
    return (
      <div className={styles.page}>
        <header className={styles.top}>
          <span className={styles.brand}>통인익스프레스</span>
        </header>
        <div className={styles.center}>
          {error ? (
            <div className={styles.errorBig}>
              <p>{error}</p>
              <p className={styles.sub}>
                {t('sign.linkHelp1')}
                <a href="tel:1899-0123"> 1899-0123</a>
                {t('sign.linkHelp2')}
              </p>
            </div>
          ) : (
            <div style={{ width: '100%', maxWidth: 640, display: 'grid', gap: 12 }}>
              <Skeleton width="60%" height={28} radius={8} />
              <Skeleton height={120} radius={14} />
              <Skeleton height={120} radius={14} />
              <Skeleton height={320} radius={14} />
            </div>
          )}
        </div>
      </div>
    );
  }

  const dep = view.deposit;

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <span className={styles.brand}>통인익스프레스</span>
        <span className={styles.no}>
          {t('sign.estimateNo')} {view.estimateNo}
        </span>
      </header>

      <main className={styles.main}>
        <section className={styles.hero}>
          <h1>
            {view.customerName}
            {t('sign.dear')}
            <br />
            {view.signed ? t('sign.signedTitle') : t('sign.checkTitle')}
          </h1>
          {view.signed && (
            <p className={styles.done}>
              <Check size={16} /> {view.signerName} · {when(view.signedAt)} {t('sign.eSign')}
            </p>
          )}
        </section>

        <section className={styles.card}>
          <div className={styles.row}>
            <span>{t('sign.total')}</span>
            <b className={styles.total}>{won(view.totalAmount)}</b>
          </div>
          <div className={styles.sub}>{view.vatIncluded ? t('sign.vatIn') : t('sign.vatEx')}</div>
          <div className={styles.row}>
            <span>{t('sign.deposit')}</span>
            <b>{won(view.depositAmount)}</b>
          </div>
          <div className={styles.row}>
            <span>{t('sign.balance')}</span>
            <b>{won(view.balanceAmount)}</b>
          </div>
        </section>

        {dep && (
          <section className={[styles.card, dep.paid ? styles.paid : ''].join(' ')}>
            <h2>{t('sign.depositPay')}</h2>
            {dep.paid ? (
              <p className={styles.done}>
                <Check size={16} /> {when(dep.paidAt)} {t('sign.paidThanks')}
              </p>
            ) : (
              <>
                <div className={styles.account}>
                  <div>
                    <b>{dep.account}</b>
                    <div className={styles.sub}>
                      {t('sign.holder')} {dep.holder}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={copied ? <Check size={14} /> : <Copy size={14} />}
                    onClick={() => {
                      const acct = (dep.account ?? '').split(' ').slice(1).join(' ');
                      void navigator.clipboard
                        ?.writeText(acct || dep.account || '')
                        .then(() => setCopied(true))
                        .catch(() => undefined);
                    }}
                  >
                    {copied ? t('sign.copied') : t('sign.copyAccount')}
                  </Button>
                </div>
                <div className={styles.sub}>
                  {won(view.depositAmount)}
                  {t('sign.payPlease')}
                  {dep.dueAt ? t('sign.until', { v0: when(dep.dueAt) }) : ''}
                  {t('sign.paidNote1')}
                  {t('sign.paidNote2')}
                </div>
              </>
            )}
          </section>
        )}

        <section className={styles.card}>
          <div className={styles.docHead}>
            <h2>{t('sign.docs')}</h2>
            <a className={styles.pdf} href={docSrc} target="_blank" rel="noreferrer">
              <Download size={14} /> {t('sign.enlarge')}
            </a>
          </div>
          <DocPreview key={docVer} src={docSrc} />
        </section>

        {!view.signed && (
          <section className={styles.card}>
            <h2>{t('sign.eSign')}</h2>
            <label className={styles.field}>
              <span>
                {t('sign.signer')}
                <span style={{ color: 'var(--ark-color-primary-500)' }}> *</span>
              </span>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
            </label>
            <SignaturePad onChange={setSignature} />
            <Checkbox
              checked={agree}
              onCheckedChange={(v) => setAgree(v === true)}
              label={t('sign.agree')}
            />
            {error && <p className={styles.error}>{error}</p>}
            <Button
              variant="primary"
              size="lg"
              loading={busy}
              disabled={!canSubmit || busy}
              onClick={() => void submit()}
            >
              {t('sign.signBtn')}
            </Button>
          </section>
        )}
      </main>

      <footer className={styles.foot}>
        통인익스프레스 · 고객센터 1899-0123 · www.tonginexp.com
      </footer>
    </div>
  );
}
