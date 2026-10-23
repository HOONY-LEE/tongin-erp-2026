import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw, Wrench } from 'lucide-react';
import styles from './ErrorBoundary.module.css';

interface Props {
  children: ReactNode;
  /** 전체 화면(로그인 전·공개 페이지)인지, 앱 안 콘텐츠 영역인지 */
  fullPage?: boolean;
}
interface State {
  error: Error | null;
}

/**
 * 화면을 그리다 오류가 나면 흰 화면·오류 내용 대신 '서비스 준비 중' 안내를 보여 준다.
 * 배포 직후 옛 화면 조각(청크)을 못 불러오는 경우도 여기서 잡혀, 새로고침으로 바로 풀린다.
 * 오류 내용은 콘솔에만 남긴다.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[화면 오류]', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className={this.props.fullPage ? styles.full : styles.inline} role="alert">
        <div className={styles.box}>
          <div className={styles.icon}>
            <Wrench size={26} />
          </div>
          <h2 className={styles.title}>서비스 준비 중입니다</h2>
          <p className={styles.desc}>
            지금 이 화면을 보여 드릴 수 없습니다. 잠시 후 다시 시도해 주세요.
            <br />
            문제가 계속되면 고객센터(1899-0123)로 알려 주세요.
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={() => location.reload()}>
              <RefreshCw size={15} /> 새로고침
            </button>
            {!this.props.fullPage && (
              <button
                type="button"
                className={styles.ghost}
                onClick={() => location.assign('/dashboard')}
              >
                대시보드로
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
}
