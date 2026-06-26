import { useState } from 'react';
import { Button, Input, useToast } from '@sunghoon_lee/akron-ui';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { openPostcode } from '../../lib/daumPostcode';
import { addrKey, type AddressPart } from './address';

interface Props {
  addrPrefix: string; // '' | 'from' | 'to'
  label: string;
  values: Record<string, string>;
  setField: (name: string, value: string) => void;
  required?: boolean;
}

interface GeocodeResult {
  available: boolean;
  lat: number | null;
  lng: number | null;
  sido: string | null;
  sigungu: string | null;
}

/** 카카오/다음 우편번호 검색 + 상세주소 + (키 있으면) 좌표 자동 보강. */
export function AddressField({ addrPrefix, label, values, setField, required }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const k = (part: AddressPart) => addrKey(addrPrefix, part);

  const search = async () => {
    setBusy(true);
    try {
      const r = await openPostcode();
      if (!r) return;
      setField(k('zipcode'), r.zonecode);
      setField(k('addr'), r.roadAddress);
      setField(k('sido'), r.sido);
      setField(k('sigungu'), r.sigungu);
      setField(k('lat'), '');
      setField(k('lng'), '');
      // 좌표 보강(카카오 키 있을 때만 채워짐)
      try {
        const geo = await api<GeocodeResult>('/geo/geocode', {
          method: 'POST',
          body: JSON.stringify({ query: r.roadAddress }),
        });
        if (geo.lat != null && geo.lng != null) {
          setField(k('lat'), String(geo.lat));
          setField(k('lng'), String(geo.lng));
        }
        if (geo.sido) setField(k('sido'), geo.sido);
        if (geo.sigungu) setField(k('sigungu'), geo.sigungu);
      } catch {
        // 좌표 보강 실패는 무시(주소·우편번호는 이미 저장됨)
      }
    } catch (e) {
      toast({ type: 'error', title: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const zipcode = values[k('zipcode')] ?? '';
  const addr = values[k('addr')] ?? '';
  const hasCoord = !!(values[k('lat')] && values[k('lng')]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 500 }}>
        {label}
        {required && <span style={{ color: 'var(--ark-color-error-500)' }}> *</span>}
      </span>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ width: 110 }}>
          <Input value={zipcode} placeholder={t('address.zipcode')} readOnly />
        </div>
        <Button variant="outline" size="sm" onClick={search} disabled={busy}>
          {t('address.search')}
        </Button>
        {hasCoord && (
          <span style={{ fontSize: 12, color: 'var(--ark-color-success-600)' }}>
            📍 {t('address.geocoded')}
          </span>
        )}
      </div>
      <Input value={addr} placeholder={t('address.road')} readOnly />
      <Input
        value={values[k('addrDetail')] ?? ''}
        placeholder={t('address.detail')}
        onChange={(e) => setField(k('addrDetail'), e.target.value)}
      />
    </div>
  );
}
