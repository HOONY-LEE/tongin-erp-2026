import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { PRODUCT_NAME } from '@tongin/shared';
import {
  DESKTOP_TARGETS,
  detectDesktopTarget,
  startDownload,
  type DesktopTarget,
} from '../../lib/desktopDownload';
import { Button, Modal } from '../ui';
import styles from './desktopDownload.module.css';

/**
 * 데스크톱 앱 설치 — 이 컴퓨터(OS·칩)에 맞는 설치 파일을 먼저 보여 주고, 다른 OS용도 고를 수 있다.
 * 웹 사이드바 아래 다운로드 아이콘에서 연다(데스크톱 앱 안에서는 버튼이 없다).
 */
export function DesktopDownloadModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [found, setFound] = useState<{ target: DesktopTarget | null; sure: boolean } | null>(null);
  useEffect(() => {
    void detectDesktopTarget().then(setFound);
  }, []);
  const main = found?.target ?? null;
  const others = (Object.keys(DESKTOP_TARGETS) as DesktopTarget[]).filter((t) => t !== main);
  const Icon = (t: DesktopTarget) => (DESKTOP_TARGETS[t].os === 'mac' ? AppleLogo : WindowsLogo);

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('misc2.desktopApp', { v0: PRODUCT_NAME })}
    >
      <div className={styles.body}>
        <p className={styles.lead}>
          {t('misc2.desktopDesc1')}
          {t('misc2.desktopDesc2')}
        </p>

        {!found ? (
          <div className={styles.main}>{t('misc2.detecting')}</div>
        ) : main ? (
          <div className={styles.main}>
            <span className={styles.mainIcon}>
              {(() => {
                const I = Icon(main);
                return <I size={26} aria-hidden />;
              })()}
            </span>
            <div className={styles.mainText}>
              <b>{DESKTOP_TARGETS[main].label}</b>
              <span>
                {found.sure ? t('misc2.forThis') : t('misc2.chipUnknown')} ·{' '}
                {DESKTOP_TARGETS[main].hint}
              </span>
            </div>
            <Button
              variant="primary"
              leftIcon={<Download size={16} />}
              onClick={() => startDownload(main)}
            >
              {t('misc2.download')}
            </Button>
          </div>
        ) : (
          <div className={styles.main}>
            <div className={styles.mainText}>
              <b>{t('misc2.noDesktop')}</b>
              <span>{t('misc2.installOnPc')}</span>
            </div>
          </div>
        )}

        <div className={styles.others}>
          <span className={styles.othersTitle}>{t('misc2.otherPc')}</span>
          {others.map((t) => {
            const I = Icon(t);
            return (
              <button
                key={t}
                type="button"
                className={styles.other}
                onClick={() => startDownload(t)}
              >
                <I size={16} aria-hidden />
                <span className={styles.otherLabel}>{DESKTOP_TARGETS[t].label}</span>
                <span className={styles.otherHint}>{DESKTOP_TARGETS[t].hint}</span>
                <Download size={15} aria-hidden className={styles.otherDl} />
              </button>
            );
          })}
        </div>

        <div className={styles.note}>
          <b>{t('misc2.firstInstall')}</b>
          <span>
            {t('misc2.mac1')}
            {t('misc2.mac2')} <b>{t('misc2.mac3')}</b> {t('misc2.mac4')} <b>{t('misc2.mac5')}</b>
            {t('misc2.mac6')}
          </span>
          <span>
            {t('misc2.win1')} <b>{t('misc2.win2')}</b>
            {t('misc2.win3')}
          </span>
        </div>
      </div>
    </Modal>
  );
}

/** 운영체제 표시용 로고 — Apple 로고(simple-icons, CC0)는 글자색, Windows 로고는 네 칸 창(공식 파랑) */
function AppleLogo({ size = 16 }: { size?: number; 'aria-hidden'?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  );
}
function WindowsLogo({ size = 16 }: { size?: number; 'aria-hidden'?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#0078D4" aria-hidden="true">
      <rect x="1" y="1" width="10.5" height="10.5" />
      <rect x="12.5" y="1" width="10.5" height="10.5" />
      <rect x="1" y="12.5" width="10.5" height="10.5" />
      <rect x="12.5" y="12.5" width="10.5" height="10.5" />
    </svg>
  );
}
