import { useEmployeePhoto } from '../../lib/employeePhoto';
import styles from './EmployeeAvatar.module.css';

/**
 * 직원 동그라미(앱 공통) — 사진이 있으면 사진, 없으면 이름 첫 글자.
 * 헤더 프로필·담당자 칩·업무·드라이브 공유 등 직원이 보이는 곳은 모두 이걸 쓴다.
 * photoAt을 모르면 비워 두면 된다(사진 있는 직원 목록에서 찾는다).
 */
export function EmployeeAvatar({
  id,
  name,
  photoAt,
  size = 20,
  className,
}: {
  /** 직원 id(없으면 첫 글자만) */
  id: string | null | undefined;
  name: string;
  photoAt?: string | null;
  size?: number;
  className?: string;
}) {
  const url = useEmployeePhoto(id, photoAt);
  return (
    <span
      className={`${styles.avatar} ${className ?? ''}`}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.42)) }}
      aria-hidden
    >
      {url ? <img src={url} alt="" /> : name.slice(0, 1)}
    </span>
  );
}
