import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { api } from '../../lib/api';
import { Button } from '../../components/ui';
import styles from '../callcenter.module.css';

interface Segment {
  speaker: string;
  start: number;
  end: number;
  text: string;
}

const mmss = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * 통화 받아쓰기 — 한국AI통신이 통화 뒤 받아쓴 원문(우리 서버에 저장된 것)을 펼쳐 본다.
 * 화자는 speaker_0/1(자동 구분) — 예전 형식은 AGENT/CUSTOMER.
 */
export function Transcript({ callId }: { callId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [segments, setSegments] = useState<Segment[] | null>(null);
  const [error, setError] = useState(false);

  const toggle = () => {
    setOpen((v) => !v);
    if (segments || open) return;
    setError(false);
    api<{ segments: Segment[] }>(`/cs-calls/${callId}/transcript`)
      .then((r) => setSegments(r.segments))
      .catch(() => setError(true));
  };
  const who = (sp: string) => {
    if (/^agent$/i.test(sp)) return t('transcript.agent');
    if (/^customer$/i.test(sp)) return t('transcript.customer');
    const n = /(\d+)$/.exec(sp);
    return t('transcript.speaker', { n: n ? Number(n[1]) + 1 : sp });
  };
  const isFirst = (sp: string) => /(^agent$)|(_0$)/i.test(sp);

  return (
    <div className={styles.transcript}>
      <div className={styles.transcriptHead}>
        <span className={styles.recLabel}>
          <FileText size={14} aria-hidden /> {t('transcript.title')}
        </span>
        <Button variant="ghost" size="sm" onClick={toggle} aria-expanded={open}>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {open ? t('transcript.hide') : t('transcript.show')}
        </Button>
      </div>
      {open && (
        <div className={styles.transcriptBody}>
          {error ? (
            <p className={styles.muted}>{t('transcript.failed')}</p>
          ) : !segments ? (
            <p className={styles.muted}>{t('transcript.loading')}</p>
          ) : segments.length === 0 ? (
            <p className={styles.muted}>{t('transcript.empty')}</p>
          ) : (
            <>
              <ol className={styles.transcriptList}>
                {segments.map((s, i) => (
                  <li key={i} className={isFirst(s.speaker) ? styles.trA : styles.trB}>
                    <span className={styles.trMeta}>
                      <b>{who(s.speaker)}</b>
                      <time className="id-mono">{mmss(s.start)}</time>
                    </span>
                    <span className={styles.trText}>{s.text}</span>
                  </li>
                ))}
              </ol>
              <p className={styles.trNote}>{t('transcript.note')}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
