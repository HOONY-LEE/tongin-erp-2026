import { forwardRef } from 'react';
import {
  SegmentedControl as AkronSegmentedControl,
  type SegmentedControlProps as AkronSegmentedControlProps,
} from '@sunghoon_lee/akron-ui';
import styles from './SegmentedControl.module.css';

/** akron-ui SegmentedControl 래퍼 — 기본 최대 크기(lg)보다 더 큰 세그먼트가 필요한 화면(탭/필터)에서 공통으로 사용. */
export const SegmentedControl = forwardRef<HTMLDivElement, AkronSegmentedControlProps>(
  function SegmentedControl({ size = 'lg', className, ...props }, ref) {
    return (
      <AkronSegmentedControl
        ref={ref}
        size={size}
        className={[styles.large, className].filter(Boolean).join(' ')}
        {...props}
      />
    );
  },
);
