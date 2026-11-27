import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import type React from 'react';
import { Badge, Button, Input, Modal, Select } from '../ui';
import {
  EVENT_CATEGORIES,
  KIND_COLOR,
  dateKey,
  displayTitle,
  formatSelectedDate,
  formatTime,
  kindLabel,
  kindOf,
  type CalKind,
  type CalendarItem,
} from '../../lib/calendarUtils';
import { fs } from '../../lib/fontScale';
import { DatePicker } from '../ui';
import { TimePicker } from '../ui';

export interface EventFormValues {
  title: string;
  /** 여러 날 일정의 마지막 날 YYYY-MM-DD. 비우면 하루짜리 */
  endDate: string;
  startTime: string;
  endTime: string;
  color: string;
  /** 종류 — MEETING·EDU·TRIP·ETC */
  category: string;
  location: string;
  description: string;
  visibility: 'PRIVATE' | 'ORG';
  orgUnitId: string;
}

interface Props {
  open: boolean;
  /** 편집 대상(없으면 신규 등록) */
  event: CalendarItem | null;
  selectedDate: Date | null;
  orgOptions: { value: string; label: string }[];
  /** 조직 일정 기본 조직(본인 소속) */
  defaultOrgUnitId?: string;
  saving?: boolean;
  onSave: (v: EventFormValues) => void;
  onDelete: () => void;
  onClose: () => void;
  /** 작업오더 등 원본 문서로 이동 */
  onOpenRef?: (e: CalendarItem) => void;
  /** 접수번호 누르기 — 접수 상세로 */
  onOpenLead?: (e: CalendarItem) => void;
  /** 계약서 보기 */
  onOpenContract?: (e: CalendarItem) => void;
}

export default function EventModal({
  open,
  event,
  selectedDate,
  orgOptions,
  defaultOrgUnitId,
  saving,
  onSave,
  onDelete,
  onClose,
  onOpenRef,
  onOpenLead,
  onOpenContract,
}: Props) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [category, setCategory] = useState<string>('MEETING');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'PRIVATE' | 'ORG'>('PRIVATE');
  const [orgUnitId, setOrgUnitId] = useState('');

  useEffect(() => {
    if (!open) return;
    setTitle(event?.title ?? '');
    // 하루짜리면 종료일 칸을 비워 둔다
    setEndDate(event && event.endDate !== event.date ? event.endDate : '');
    setStartTime(event?.startTime ?? '');
    setEndTime(event?.endTime ?? '');
    setCategory(event ? kindOf(event) : 'MEETING');
    setLocation(event?.location ?? '');
    setDescription(event?.description ?? '');
    setVisibility(event?.visibility ?? 'PRIVATE');
    setOrgUnitId(event?.orgUnitId ?? defaultOrgUnitId ?? '');
  }, [open, event, defaultOrgUnitId]);

  const readOnly = Boolean(event && !event.editable);

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      endDate,
      startTime,
      endTime,
      color: KIND_COLOR[category as CalKind] ?? KIND_COLOR.ETC,
      category,
      location,
      description,
      visibility,
      orgUnitId,
    });
  };

  // 작업오더 등 읽기전용 항목은 상세만 보여준다.
  if (readOnly && event) {
    return (
      <Modal
        open={open}
        onOpenChange={(v) => {
          if (!v) onClose();
        }}
        size="sm"
        title={displayTitle(event)}
        description={selectedDate ? formatSelectedDate(selectedDate) : undefined}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: fs(12),
                fontWeight: 600,
              }}
            >
              <span
                style={{
                  width: 3,
                  height: 14,
                  borderRadius: 2,
                  background: KIND_COLOR[kindOf(event)],
                }}
              />
              {kindLabel(kindOf(event))}
            </span>
            {event.orgUnitName && (
              <Badge variant="subtle" color="neutral">
                {event.orgUnitName}
              </Badge>
            )}
            {event.ownerName && (
              <Badge variant="subtle" color="neutral">
                {event.ownerName}
              </Badge>
            )}
          </div>
          <Row
            label={t('cal.time')}
            value={event.startTime ? formatTime(event.startTime) : t('cal.allDay')}
          />
          {event.location && <Row label={t('cal.place')} value={event.location} />}
          {event.leadNo && (
            <Row
              label={t('cal.leadNo')}
              value={
                event.leadId && onOpenLead ? (
                  <button
                    type="button"
                    className="id-mono"
                    onClick={() => onOpenLead(event)}
                    style={{
                      all: 'unset',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      textUnderlineOffset: 3,
                    }}
                  >
                    {event.leadNo}
                  </button>
                ) : (
                  event.leadNo
                )
              }
            />
          )}
          {event.description && <Row label={t('cal.memo')} value={event.description} />}
          <div style={{ fontSize: fs(12), color: 'var(--ark-color-text-tertiary)' }}>
            {t('cal.readonly')}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            {event.contract && onOpenContract && (
              <Button variant="secondary" onClick={() => onOpenContract(event)}>
                {t('cal.openContract')}
              </Button>
            )}
            {event.refId && onOpenRef && (
              <Button variant="primary" onClick={() => onOpenRef(event)}>
                {event.source === 'LEAVE'
                  ? t('cal.openApproval')
                  : event.source === 'VISIT'
                    ? t('cal.openVisit')
                    : t('cal.openWork')}
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              {t('cal.close')}
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      size="sm"
      title={event ? t('cal.editTitle') : t('cal.newTitle')}
      description={selectedDate ? formatSelectedDate(selectedDate) : undefined}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Input
          label={t('cal.f.title')}
          placeholder={t('cal.f.titlePh')}
          value={title}
          autoFocus
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
          }}
        />

        <Select
          label={t('cal.f.kind')}
          value={category}
          onValueChange={setCategory}
          options={EVENT_CATEGORIES.map((c) => ({ value: c, label: kindLabel(c) }))}
        />

        <DatePicker
          label={t('cal.f.endDate')}
          value={endDate}
          min={selectedDate ? dateKey(selectedDate) : undefined}
          onChange={(v) => setEndDate(v)}
        />

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <TimePicker
              label={t('cal.f.start')}
              value={startTime}
              onChange={(v) => setStartTime(v)}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <TimePicker label={t('cal.f.end')} value={endTime} onChange={(v) => setEndTime(v)} />
          </div>
        </div>
        <div style={{ fontSize: fs(12), color: 'var(--ark-color-text-tertiary)', marginTop: -10 }}>
          {t('cal.f.help')}
        </div>

        <Select
          label={t('cal.f.scope')}
          value={visibility}
          onValueChange={(v) => setVisibility(v as 'PRIVATE' | 'ORG')}
          options={[
            { value: 'PRIVATE', label: t('cal.f.private') },
            { value: 'ORG', label: t('cal.f.org') },
          ]}
        />

        {visibility === 'ORG' && (
          <Select
            label={t('cal.f.shareOrg')}
            value={orgUnitId}
            onValueChange={setOrgUnitId}
            options={orgOptions}
            placeholder={t('cal.f.pickOrg')}
          />
        )}

        <Input
          label={t('cal.place')}
          placeholder={t('cal.f.placePh')}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />

        <Input
          label={t('cal.memo')}
          placeholder={t('cal.f.detail')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          {event && (
            <Button variant="danger" onClick={onDelete} style={{ marginRight: 'auto' }}>
              {t('cal.delete')}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t('cal.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={!title.trim() || saving || (visibility === 'ORG' && !orgUnitId)}
          >
            {t('cal.save')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, fontSize: fs(14) }}>
      <span style={{ minWidth: 48, color: 'var(--ark-color-text-secondary)' }}>{label}</span>
      <span style={{ color: 'var(--ark-color-text)' }}>{value}</span>
    </div>
  );
}
