import { useEffect, useState } from 'react';
import { Download, Laptop, Monitor } from 'lucide-react';
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
  const Icon = (t: DesktopTarget) => (DESKTOP_TARGETS[t].os === 'mac' ? Laptop : Monitor);

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
