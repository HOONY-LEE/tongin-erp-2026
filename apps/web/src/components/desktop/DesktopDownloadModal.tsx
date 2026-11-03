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
  const [found, setFound] = useState<{ target: DesktopTarget | null; sure: boolean } | null>(null);
  useEffect(() => {
    void detectDesktopTarget().then(setFound);
  }, []);
  const main = found?.target ?? null;
  const others = (Object.keys(DESKTOP_TARGETS) as DesktopTarget[]).filter((t) => t !== main);
  const Icon = (t: DesktopTarget) => (DESKTOP_TARGETS[t].os === 'mac' ? AppleLogo : WindowsLogo);

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={`${PRODUCT_NAME} 데스크톱 앱`}>
      <div className={styles.body}>
        <p className={styles.lead}>
          브라우저 없이 바로 열리는 앱입니다. 화면은 웹과 같고, 웹이 바뀌면 앱도 자동으로 새 화면이
          됩니다.
        </p>

        {!found ? (
          <div className={styles.main}>이 컴퓨터를 확인하는 중…</div>
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
                {found.sure
                  ? '이 컴퓨터에 맞는 설치 파일'
                  : '맥 칩을 알 수 없어 Apple 실리콘으로 골랐습니다'}{' '}
                · {DESKTOP_TARGETS[main].hint}
              </span>
            </div>
            <Button
              variant="primary"
              leftIcon={<Download size={16} />}
              onClick={() => startDownload(main)}
            >
              다운로드
            </Button>
          </div>
        ) : (
          <div className={styles.main}>
            <div className={styles.mainText}>
              <b>이 기기에는 데스크톱 앱이 없습니다</b>
              <span>
                맥이나 윈도우 컴퓨터에서 설치해 주세요. 휴대폰·태블릿은 웹으로 쓰면 됩니다.
              </span>
            </div>
          </div>
        )}

        <div className={styles.others}>
          <span className={styles.othersTitle}>다른 컴퓨터용</span>
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
          <b>처음 설치할 때</b>
          <span>
            맥: dmg를 열어 앱을 응용 프로그램 폴더로 끈 뒤, 처음 한 번은 앱을 <b>우클릭 → 열기</b>로
            엽니다.
          </span>
          <span>
            윈도우: 설치 파일 실행 후 &lsquo;Windows의 PC 보호&rsquo; 창이 뜨면{' '}
            <b>추가 정보 → 실행</b>을 누릅니다.
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
