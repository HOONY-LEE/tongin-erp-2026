import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { Download, Play } from 'lucide-react';
import { getToken } from '../../lib/api';
import { Button, useToast } from '../../components/ui';
import styles from '../callcenter.module.css';

/**
 * 통화 녹취 — 파일은 우리 서버에 두지 않는다. 누를 때 한국AI통신(90일 보관)에서 받아 와 듣고·내려받는다.
 * 녹취는 인증이 필요해 <audio src>로 바로 못 연다 — 받아서 브라우저 메모리에서 재생.
 */
export function Recording({
  callId,
  callNo,
  available,
}: {
  callId: string;
  callNo?: string | null;
  available: boolean;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );

  const fetchFile = async () => {
    if (url) return url;
    setLoading(true);
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
      setUrl(u);
      return u;
    } catch (e) {
      toast({
        type: 'error',
        title: e instanceof Error ? e.message : t('cc.recLoadFailed'),
      });
      return null;
    } finally {
      setLoading(false);
    }
  };
  const download = async () => {
    const u = await fetchFile();
    if (!u) return;
    const a = document.createElement('a');
    a.href = u;
    a.download = t('cc.recFile', { v0: callNo ?? callId.slice(0, 8).toUpperCase() });
    a.click();
  };

  return (
    <div className={styles.recording}>
      <span className={styles.recLabel}>{t('cc.recording')}</span>
      {url ? (
        <audio controls autoPlay src={url} className={styles.recAudio} />
      ) : (
        <Button variant="outline" size="sm" disabled={loading} onClick={() => void fetchFile()}>
          <Play size={14} /> {loading ? t('cc.loading') : t('cc.listen')}
        </Button>
      )}
      <Button variant="ghost" size="sm" disabled={loading} onClick={() => void download()}>
        <Download size={14} /> {t('cc.download')}
      </Button>
      {!available && <span className={styles.muted}>{t('cc.recNotFound')}</span>}
    </div>
  );
}
