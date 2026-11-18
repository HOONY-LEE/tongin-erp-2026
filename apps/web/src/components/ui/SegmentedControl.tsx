import { forwardRef } from 'react';
import {
  SegmentedControl as AkronSegmentedControl,
  type SegmentedControlProps as AkronSegmentedControlProps,
} from '@sunghoon_lee/akron-ui';
import styles from './SegmentedControl.module.css';

/**
 * 세그먼트 탭 — 앱 전체 공용. 화면에서는 akron 것을 바로 쓰지 말고 이것을 쓴다.
 * 크기는 두 가지만:
 *  - 기본(md·lg): 트랙 38px — 검색칸·드롭다운·버튼과 같은 높이. 화면 탭·표 위 탭·폼 안 선택
 *  - sm: 트랙 32px — 카드 머리글 안 작은 필터
 * 트랙·칸·선택 표시(흰 칸)의 높이와 안쪽 여백을 여기서 한 번에 맞춘다(위로 치우치지 않게).
 */
export const SegmentedControl = forwardRef<HTMLDivElement, AkronSegmentedControlProps>(
  function SegmentedControl({ size, className, ...props }, ref) {
    const small = size === 'sm';
    return (
      <AkronSegmentedControl
        ref={ref}
        size="md"
        className={[styles.seg, small ? styles.sm : styles.md, className]
          .filter(Boolean)
          .join(' ')}
        {...props}
      />
    );
  },
);
