import { Transform } from 'class-transformer';
import { phoneDigits } from '@tongin/shared';

/** 연락처는 숫자만 저장한다 — 하이픈·공백을 빼서 받고, 숫자가 하나도 없으면 비운다(null) */
export const PhoneDigits = () =>
  Transform(({ value }) => (typeof value === 'string' ? phoneDigits(value) || null : value));
