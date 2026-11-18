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
      title="PC 전화 소리 설정"
      footer={
        <Button variant="primary" onClick={onClose}>
          닫기
        </Button>
      }
    >
      <div className={styles.settings}>
        <div className={styles.field}>
          <span>벨소리</span>
          <SegmentedControl
            value={s.ring ? 'on' : 'off'}
            onChange={(v) => setPhoneSettings({ ring: v === 'on' })}
            options={[
              { value: 'on', label: '켜기' },
              { value: 'off', label: '끄기(화면만)' },
            ]}
          />
        </div>
        <div className={styles.field}>
          <span>벨소리 종류</span>
          <SegmentedControl
            value={s.ringStyle}
            onChange={(v) => {
              setPhoneSettings({ ringStyle: v as RingStyle });
              previewRingtone(v as RingStyle);
            }}
            options={[
              { value: 'classic', label: '기본' },
              { value: 'soft', label: '부드럽게' },
              { value: 'bell', label: '종소리' },
            ]}
          />
        </div>
        <label className={styles.field}>
          <span>벨소리 크기 · {Math.round(s.volume * 100)}%</span>
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
              aria-label="벨소리 크기"
              disabled={!s.ring}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={!s.ring}
              onClick={() => previewRingtone()}
            >
              <Volume2 size={14} /> 들어보기
            </Button>
          </span>
        </label>
        <label className={styles.field}>
          <span>소리 나는 곳(스피커 · 헤드셋)</span>
          <Select
            value={s.outputDeviceId || DEFAULT}
            onValueChange={(v) => setPhoneSettings({ outputDeviceId: v === DEFAULT ? '' : v })}
            options={[{ value: DEFAULT, label: '기본 장치' }, ...devices.outputs]}
          />
        </label>
        <label className={styles.field}>
          <span>마이크</span>
          <Select
            value={s.inputDeviceId || DEFAULT}
            onValueChange={(v) => setPhoneSettings({ inputDeviceId: v === DEFAULT ? '' : v })}
            options={[{ value: DEFAULT, label: '기본 장치' }, ...devices.inputs]}
          />
        </label>
        <p className={styles.muted}>
          설정은 이 PC에만 저장됩니다. 장치 이름이 안 보이면 PC 전화를 한 번 켜서 마이크 권한을
          허용해 주세요. 마이크를 바꾸면 다음 통화부터 적용됩니다.
        </p>
      </div>
    </Modal>
  );
}
