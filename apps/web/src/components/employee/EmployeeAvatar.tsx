import { useEmployeePhoto } from '../../lib/employeePhoto';
import styles from './EmployeeAvatar.module.css';

/** 직원 동그라미 — 사진이 있으면 사진, 없으면 이름 첫 글자 */
export function EmployeeAvatar({
  id,
  name,
  photoAt,
  size = 20,
  className,
}: {
  id: string;
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
