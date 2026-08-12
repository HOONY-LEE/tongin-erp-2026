import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Input, useToast } from '@sunghoon_lee/akron-ui';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { embedPostcode, type PostcodeResult } from '../../lib/daumPostcode';
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

/** 카카오/다음 우편번호 검색(서비스 내 모달로 임베드) + 상세주소 + (키 있으면) 좌표 자동 보강. */
export function AddressField({ addrPrefix, label, values, setField, required }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const k = (part: AddressPart) => addrKey(addrPrefix, part);

  const applyResult = async (r: PostcodeResult) => {
    setField(k('zipcode'), r.zonecode);
    setField(k('addr'), r.roadAddress);
    setField(k('sido'), r.sido);
    setField(k('sigungu'), r.sigungu);
    setField(k('lat'), '');
    setField(k('lng'), '');
    setSearchOpen(false);
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
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!searchOpen || !container) return;
    let cancelled = false;
    setBusy(true);
    // StrictMode 개발모드 이중 렌더 시 첫 번째 embed 호출이 두 번째에 밀려 iframe 요청이
    // 취소되는 것을 막기 위해 rAF로 한 틱 늦추고, cleanup에서 취소되면 아예 실행하지 않는다.
    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      embedPostcode(container, (r) => {
        if (!cancelled) void applyResult(r);
      })
        .catch((e) => {
          if (cancelled) return;
          toast({ type: 'error', title: (e as Error).message });
          setSearchOpen(false);
        })
        .finally(() => {
          if (!cancelled) setBusy(false);
        });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [searchOpen]);

  const zipcode = values[k('zipcode')] ?? '';
  const addr = values[k('addr')] ?? '';
  const addrDisplay = addr ? (zipcode ? `${addr} (${zipcode})` : addr) : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 500 }}>
        {label}
        {required && <span style={{ color: 'var(--ark-color-primary-500)' }}> *</span>}
      </span>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setSearchOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setSearchOpen(true);
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 36,
          padding: '0 12px',
          border: '1px solid var(--ark-color-border)',
          borderRadius: 'var(--ark-radius-md, 8px)',
          fontSize: 'var(--ark-font-size-sm)',
          color: addrDisplay ? 'var(--ark-color-text)' : 'var(--ark-color-text-tertiary)',
          background: 'var(--ark-color-bg)',
          cursor: 'pointer',
        }}
      >
        {addrDisplay || t('address.search')}
      </div>
      <Input
        value={values[k('addrDetail')] ?? ''}
        placeholder={t('address.detail')}
        onChange={(e) => setField(k('addrDetail'), e.target.value)}
      />

      {searchOpen &&
        createPortal(
          <div
            onClick={() => setSearchOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 2000,
              background: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 460,
                maxWidth: '90vw',
                background: 'var(--ark-color-bg)',
                borderRadius: 12,
                boxShadow: 'var(--ark-shadow-lg, 0 10px 40px rgba(0,0,0,0.2))',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 16px',
                  borderBottom: '1px solid var(--ark-color-border)',
                }}
              >
                <span style={{ fontSize: 15, fontWeight: 600 }}>{t('address.search')}</span>
                <button
                  type="button"
                  onClick={() => setSearchOpen(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 26,
                    height: 26,
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--ark-color-text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  <X size={16} />
                </button>
              </div>
              <div style={{ width: '100%', height: 460, position: 'relative' }}>
                {busy && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--ark-color-text-tertiary)',
                      fontSize: 13,
                    }}
                  >
                    불러오는 중…
                  </div>
                )}
                <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
