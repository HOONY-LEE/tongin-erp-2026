import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@sunghoon_lee/akron-ui';
import { ArrowLeftRight, Download, Headphones } from 'lucide-react';
import { api, getToken } from '../../lib/api';
import { Button, useToast } from '../../components/ui';
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

/** 파일 내려받기(브라우저 메모리의 주소로) */
function save(href: string, name: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.click();
}

/**
 * 끝난 콜의 [통화 녹취] 버튼 — 누르면 창에서 녹취 듣기 · 녹취 파일 다운로드 · 녹취록 · 녹취록 다운로드.
 * 녹취 파일은 우리 서버에 두지 않고 누를 때 한국AI통신(90일 보관)에서 받아 온다(인증이 필요해 메모리에서 재생).
 * 녹취록은 통화 뒤 받아쓴 원문(우리 서버에 저장) — 화자는 speaker_0/1 자동 구분(예전 형식 AGENT/CUSTOMER).
 */
export function CallRecordButton({
  callId,
  callNo,
  hasRecording,
  hasTranscript,
}: {
  callId: string;
  callNo?: string | null;
  hasRecording: boolean;
  hasTranscript: boolean;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioState, setAudioState] = useState<'idle' | 'loading' | 'failed'>('idle');
  const [segments, setSegments] = useState<Segment[] | null>(null);
  const [scriptFailed, setScriptFailed] = useState(false);
  /** 상담사·고객 바꾸기 — 화자 구분이 자동이라 뒤바뀌어 나올 수 있다(받아 둔 파일에도 그대로) */
  const [swapped, setSwapped] = useState(false);
  const fileNo = callNo ?? callId.slice(0, 8).toUpperCase();

  useEffect(
    () => () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    },
    [audioUrl],
  );

  const loadAudio = async () => {
    if (audioUrl) return audioUrl;
    setAudioState('loading');
    try {
      const token = getToken();
      const res = await fetch(`/api/cs-calls/${callId}/recording`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? t('cc.recLoadFailed'));
      }
      const u = URL.createObjectURL(await res.blob());
      setAudioUrl(u);
      setAudioState('idle');
      return u;
    } catch (e) {
      setAudioState('failed');
      toast({ type: 'error', title: e instanceof Error ? e.message : t('cc.recLoadFailed') });
      return null;
    }
  };

  // 창을 열면 녹취·녹취록을 함께 불러온다
  const openModal = () => {
    setOpen(true);
    if (hasRecording && !audioUrl && audioState !== 'loading') void loadAudio();
    if (hasTranscript && !segments) {
      setScriptFailed(false);
      api<{ segments: Segment[] }>(`/cs-calls/${callId}/transcript`)
        .then((r) => setSegments(r.segments))
        .catch(() => setScriptFailed(true));
    }
  };

  // 상담사 = 예전 형식이면 AGENT, 아니면 처음 말한 사람(바꾸기로 뒤집는다). 나머지는 고객
  const base =
    segments?.find((s) => /^agent$/i.test(s.speaker))?.speaker ?? segments?.[0]?.speaker ?? '';
  const isAgent = (sp: string) => (sp === base) !== swapped;
  const who = (sp: string) => (isAgent(sp) ? t('transcript.agent') : t('transcript.customer'));

  const downloadAudio = async () => {
    const u = await loadAudio();
    if (u) save(u, t('cc.recFile', { v0: fileNo }));
  };
  const downloadScript = () => {
    if (!segments?.length) return;
    const text = segments.map((s) => `[${mmss(s.start)}] ${who(s.speaker)}: ${s.text}`).join('\n');
    const u = URL.createObjectURL(
      new Blob([`\uFEFF${text}\n`], { type: 'text/plain;charset=utf-8' }),
    );
    save(u, t('transcript.scriptFile', { v0: fileNo }));
    setTimeout(() => URL.revokeObjectURL(u), 10_000);
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={openModal}>
        <Headphones size={14} /> {t('transcript.button')}
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        size="md"
        title={t('transcript.modalTitle', { v0: fileNo })}
      >
        <div className={styles.recModal}>
          <section className={styles.recSection}>
            <div className={styles.recSectionHead}>
              <b>{t('transcript.listen')}</b>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasRecording || audioState === 'loading'}
                onClick={() => void downloadAudio()}
              >
                <Download size={14} /> {t('transcript.downloadAudio')}
              </Button>
            </div>
            {!hasRecording ? (
              <p className={styles.muted}>{t('cc.recNotFound')}</p>
            ) : audioUrl ? (
              <audio controls src={audioUrl} className={styles.recModalAudio} />
            ) : (
              <p className={styles.muted}>
                {audioState === 'failed' ? t('cc.recLoadFailed') : t('cc.loading')}
              </p>
            )}
          </section>
          <section className={styles.recSection}>
            <div className={styles.recSectionHead}>
              <b>{t('transcript.script')}</b>
              <span className={styles.recHeadBtns}>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!segments?.length}
                  onClick={() => setSwapped((v) => !v)}
                >
                  <ArrowLeftRight size={14} /> {t('transcript.swap')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!segments?.length}
                  onClick={downloadScript}
                >
                  <Download size={14} /> {t('transcript.downloadScript')}
                </Button>
              </span>
            </div>
            {!hasTranscript ? (
              <p className={styles.muted}>{t('transcript.noScript')}</p>
            ) : scriptFailed ? (
              <p className={styles.muted}>{t('transcript.failed')}</p>
            ) : !segments ? (
              <p className={styles.muted}>{t('transcript.loading')}</p>
            ) : segments.length === 0 ? (
              <p className={styles.muted}>{t('transcript.empty')}</p>
            ) : (
              <ol className={`${styles.chatList} ${styles.recScript}`}>
                {segments.map((s, i) => {
                  const me = isAgent(s.speaker);
                  // 같은 사람이 이어 말하면 이름은 처음에만
                  const cont = i > 0 && isAgent(segments[i - 1].speaker) === me;
                  return (
                    <li key={i} className={me ? styles.chatMe : styles.chatThem}>
                      {!cont && <span className={styles.chatWho}>{who(s.speaker)}</span>}
                      <span className={styles.chatRow}>
                        <span className={styles.chatBubble}>{s.text}</span>
                        <time className={`id-mono ${styles.chatTime}`}>{mmss(s.start)}</time>
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>
      </Modal>
    </>
  );
}
