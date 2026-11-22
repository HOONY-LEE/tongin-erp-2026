import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Phone } from 'lucide-react';
import { Button, ConfirmModal, PhoneInput } from '../../components/ui';
import { dial, usePhone } from '../../lib/softphone';

/**
 * [전화하기] — 번호를 쳐서 PC 전화로 건다(대표번호로 발신). 콜 목록의 내보내기 옆.
 * PC 전화가 켜져 있고 통화 중이 아닐 때만 누를 수 있다.
 */
export function DialButton() {
  const { t } = useTranslation();
  const phone = usePhone();
  const [open, setOpen] = useState(false);
  const [no, setNo] = useState('');
  const ok = no.length >= 7;
  const go = () => {
    if (!ok) return;
    setOpen(false);
    dial(no);
  };
  return (
    <>
      <Button
        variant="primary"
        size="sm"
        disabled={phone.status !== 'ready' || !!phone.call}
        onClick={() => {
          setNo('');
          setOpen(true);
        }}
      >
        <Phone size={15} /> {t('cc.call')}
      </Button>
      <ConfirmModal
        open={open}
        title={t('cc.dialNumber')}
        confirmLabel={t('cc.dial')}
        onClose={() => setOpen(false)}
        onConfirm={go}
      >
        <PhoneInput
          autoFocus
          value={no}
          placeholder={t('cc.dialPh')}
          onChange={setNo}
          onKeyDown={(e) => {
            if (e.key === 'Enter') go();
          }}
        />
      </ConfirmModal>
    </>
  );
}
