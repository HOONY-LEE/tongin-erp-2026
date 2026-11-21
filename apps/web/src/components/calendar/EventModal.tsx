import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { Badge, Button, Input, Modal, Select } from '../ui';
import {
  COLORS,
  dateKey,
  formatSelectedDate,
  formatTime,
  type CalendarItem,
} from '../../lib/calendarUtils';
import { fs } from '../../lib/fontScale';
import { DatePicker } from '../ui';

export interface EventFormValues {
  title: string;
  /** 여러 날 일정의 마지막 날 YYYY-MM-DD. 비우면 하루짜리 */
  endDate: string;
  startTime: string;
  endTime: string;
  color: string;
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
}: Props) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [color, setColor] = useState(COLORS[0]);
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
    setColor(event?.color ?? COLORS[0]);
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
      color,
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
        title={event.title}
        description={selectedDate ? formatSelectedDate(selectedDate) : undefined}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {event.source === 'WORK_ORDER' && (
              <Badge variant="subtle" color="info">
                {t('cal.src.WORK')}
              </Badge>
            )}
            {event.source === 'LEAVE' && (
              <Badge variant="subtle" color="primary">
                {t('cal.src.LEAVE')}
              </Badge>
            )}
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
          {event.description && <Row label={t('cal.memo')} value={event.description} />}
          <div style={{ fontSize: fs(12), color: 'var(--ark-color-text-tertiary)' }}>
            {t('cal.readonly')}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            {event.refId && onOpenRef && (
              <Button variant="outline" onClick={() => onOpenRef(event)}>
                {event.source === 'LEAVE' ? t('cal.openApproval') : t('cal.openWork')}
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

        <DatePicker
          label={t('cal.f.endDate')}
          value={endDate}
          min={selectedDate ? dateKey(selectedDate) : undefined}
          onChange={(v) => setEndDate(v)}
        />

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Input
              label={t('cal.f.start')}
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Input
              label={t('cal.f.end')}
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
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

        <div>
          <div
            style={{
              fontSize: fs(13),
              fontWeight: 500,
              marginBottom: 8,
              color: 'var(--ark-color-text-secondary)',
            }}
          >
            {t('cal.f.color')}
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={c}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: c,
                  border: 'none',
                  cursor: 'pointer',
                  outline: color === c ? '2px solid var(--ark-color-text)' : 'none',
                  outlineOffset: 2,
                }}
              />
            ))}
          </div>
        </div>

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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, fontSize: fs(14) }}>
      <span style={{ minWidth: 48, color: 'var(--ark-color-text-secondary)' }}>{label}</span>
      <span style={{ color: 'var(--ark-color-text)' }}>{value}</span>
    </div>
  );
}
