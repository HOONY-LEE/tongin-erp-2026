import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { Volume2 } from 'lucide-react';
import {
  listAudioDevices,
  previewRingtone,
  setPhoneSettings,
  usePhoneSettings,
  type RingStyle,
} from '../../lib/softphone';
import { Button, Modal, SegmentedControl, Select } from '../../components/ui';
import styles from '../callcenter.module.css';

const DEFAULT = '__default';

/**
 * PC 전화 소리 설정 — 벨소리(켜기·크기·종류)와 스피커·마이크 장치. 이 PC에만 저장된다.
 */
export function PhoneSettingsModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const s = usePhoneSettings();
  const [devices, setDevices] = useState<{
    inputs: { value: string; label: string }[];
    outputs: { value: string; label: string }[];
  }>({ inputs: [], outputs: [] });

  useEffect(() => {
    void listAudioDevices().then(setDevices);
    const onChange = () => void listAudioDevices().then(setDevices);
    navigator.mediaDevices?.addEventListener?.('devicechange', onChange);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', onChange);
  }, []);

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('cc.soundSettings')}
      footer={
        <Button variant="primary" onClick={onClose}>
          {t('cc.close')}
        </Button>
      }
    >
      <div className={styles.settings}>
        <div className={styles.field}>
          <span>{t('cc.ringtone')}</span>
          <SegmentedControl
            value={s.ring ? 'on' : 'off'}
            onChange={(v) => setPhoneSettings({ ring: v === 'on' })}
            options={[
              { value: 'on', label: t('cc.on') },
              { value: 'off', label: t('cc.off') },
            ]}
          />
        </div>
        <div className={styles.field}>
          <span>{t('cc.ringtoneKind')}</span>
          <SegmentedControl
            value={s.ringStyle}
            onChange={(v) => {
              setPhoneSettings({ ringStyle: v as RingStyle });
              previewRingtone(v as RingStyle);
            }}
            options={[
              { value: 'classic', label: t('cc.rt.default') },
              { value: 'soft', label: t('cc.rt.soft') },
              { value: 'bell', label: t('cc.rt.bell') },
            ]}
          />
        </div>
        <label className={styles.field}>
          <span>
            {t('cc.volume')} {Math.round(s.volume * 100)}%
          </span>
          <span className={styles.volume}>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(s.volume * 100)}
              onChange={(e) => setPhoneSettings({ volume: Number(e.target.value) / 100 })}
              onPointerUp={() => previewRingtone()}
              onKeyUp={() => previewRingtone()}
              aria-label={t('cc.volumeAria')}
              disabled={!s.ring}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={!s.ring}
              onClick={() => previewRingtone()}
            >
              <Volume2 size={14} /> {t('cc.preview')}
            </Button>
          </span>
        </label>
        <label className={styles.field}>
          <span>{t('cc.output')}</span>
          <Select
            value={s.outputDeviceId || DEFAULT}
            onValueChange={(v) => setPhoneSettings({ outputDeviceId: v === DEFAULT ? '' : v })}
            options={[{ value: DEFAULT, label: t('cc.defaultDevice') }, ...devices.outputs]}
          />
        </label>
        <label className={styles.field}>
          <span>{t('cc.mic')}</span>
          <Select
            value={s.inputDeviceId || DEFAULT}
            onValueChange={(v) => setPhoneSettings({ inputDeviceId: v === DEFAULT ? '' : v })}
            options={[{ value: DEFAULT, label: t('cc.defaultDevice') }, ...devices.inputs]}
          />
        </label>
        <p className={styles.muted}>
          {t('cc.soundNote1')}
          {t('cc.soundNote2')}
        </p>
      </div>
    </Modal>
  );
}
