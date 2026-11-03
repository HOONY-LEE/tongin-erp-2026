import { forwardRef, type ComponentProps } from 'react';
import { Input } from '@sunghoon_lee/akron-ui';
import { formatPhone, phoneDigits } from '../../lib/phone';

type Props = Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> & {
  value: string;
  /** 숫자만(01012345678) — 저장도 숫자만, 하이픈은 보일 때만 */
  onChange: (digits: string) => void;
};

/**
 * 연락처 입력 — 숫자만 받고, 보일 때 자리에 맞춰 하이픈을 넣는다(010-1234-5678, 02-123-4567).
 * 값(value·onChange)은 숫자만 — DB에도 숫자만 들어간다. 글자·기호는 쳐도 무시되고, 붙여 넣은 값도 숫자만 골라 쓴다.
 * 앱 전체 연락처 칸은 이것을 쓴다.
 */
export const PhoneInput = forwardRef<HTMLInputElement, Props>(function PhoneInput(
  { value, onChange, placeholder = '010-0000-0000', ...rest },
  ref,
) {
  return (
    <Input
      ref={ref}
      type="tel"
      inputMode="numeric"
      autoComplete="tel"
      maxLength={13}
      placeholder={placeholder}
      value={formatPhone(value ?? '')}
      onKeyDown={(e) => {
        // 숫자·편집 키(지우기·이동·복사 등)만 — 한 글자짜리 다른 키는 막는다
        if (e.key.length === 1 && !/\d/.test(e.key) && !e.metaKey && !e.ctrlKey) e.preventDefault();
      }}
      onChange={(e) => onChange(phoneDigits(e.target.value).slice(0, 11))}
      {...rest}
    />
  );
});
