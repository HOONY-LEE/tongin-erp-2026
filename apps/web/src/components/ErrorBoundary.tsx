import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw, Wrench } from 'lucide-react';
import { reportClientError } from '../lib/reportError';
import styles from './ErrorBoundary.module.css';
import i18n from '../i18n';

interface Props {
  children: ReactNode;
  /** 전체 화면(로그인 전·공개 페이지)인지, 앱 안 콘텐츠 영역인지 */
  fullPage?: boolean;
}
interface State {
  error: Error | null;
  ref: string | null;
}

/** 배포 직후 옛 화면 조각(청크)을 못 불러오는 오류 — 새로고침하면 바로 풀린다 */
const isChunkError = (e: Error) =>
  e.name === 'ChunkLoadError' ||
  /dynamically imported module|Importing a module script failed|Loading (CSS )?chunk/i.test(
    e.message,
  );

/**
 * 화면을 그리다 오류가 나면 흰 화면·오류 내용 대신 상황에 맞는 안내를 보여 준다.
 *  - 새 버전 배포 직후(옛 화면 조각을 못 불러옴) → '새 버전이 나왔습니다' + 새로고침
 *  - 그 밖의 화면 오류 → '화면을 여는 중 오류' + 오류 번호(콘솔에 같은 번호로 남긴다)
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, ref: null };

  static getDerivedStateFromError(error: Error): State {
    return { error, ref: Math.random().toString(16).slice(2, 8).toUpperCase() };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[화면 오류 ${this.state.ref ?? ''}]`, error, info.componentStack);
    // 옛 화면 조각 오류는 새로고침으로 풀리니 남기지 않는다
    if (!isChunkError(error))
      reportClientError(error, {
        ref: this.state.ref ?? undefined,
        componentStack: info.componentStack ?? undefined,
      });
  }

  render() {
    const { error, ref } = this.state;
    if (!error) return this.props.children;
    const chunk = isChunkError(error);
    const t = i18n.t;
    return (
      <div className={this.props.fullPage ? styles.full : styles.inline} role="alert">
        <div className={styles.box}>
          <div className={styles.icon}>
            <Wrench size={26} />
          </div>
          {chunk ? (
            <>
              <h2 className={styles.title}>{t('ui.err.newVersion')}</h2>
              <p className={styles.desc}>{t('ui.err.reloadLatest')}</p>
            </>
          ) : (
            <>
              <h2 className={styles.title}>{t('ui.err.title')}</h2>
              <p className={styles.desc}>
                {t('ui.err.contact')}
                <br />
                <span className={styles.ref}>{t('ui.err.ref', { ref: ref ?? '' })}</span>
              </p>
            </>
          )}
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={() => location.reload()}>
              <RefreshCw size={15} /> {t('ui.err.reload')}
            </button>
            {!this.props.fullPage && (
              <button
                type="button"
                className={styles.ghost}
                onClick={() => location.assign('/dashboard')}
              >
                {t('ui.err.toDashboard')}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
}
