import { useEffect, useState } from 'react';
import { Badge, Button, Input, Modal, Select } from '../ui';
import {
  COLORS,
  formatSelectedDate,
  formatTime,
  type CalendarItem,
} from '../../lib/calendarUtils';

export interface EventFormValues {
  title: string;
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
  const [title, setTitle] = useState('');
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
                작업 일정
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
          <Row label="시간" value={event.startTime ? formatTime(event.startTime) : '종일'} />
          {event.location && <Row label="장소" value={event.location} />}
          {event.description && <Row label="메모" value={event.description} />}
          <div style={{ fontSize: 12, color: 'var(--ark-color-text-tertiary)' }}>
            다른 사람이 등록했거나 시스템이 생성한 일정이라 여기서는 수정할 수 없습니다.
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            {event.refId && onOpenRef && (
              <Button variant="outline" onClick={() => onOpenRef(event)}>
                작업 상세 열기 →
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              닫기
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
      title={event ? '일정 편집' : '새로운 일정'}
      description={selectedDate ? formatSelectedDate(selectedDate) : undefined}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Input
          label="제목"
          placeholder="일정 제목"
          value={title}
          autoFocus
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
          }}
        />

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Input
              label="시작"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Input
              label="종료"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--ark-color-text-tertiary)', marginTop: -10 }}>
          시간을 비워두면 종일 일정으로 저장됩니다.
        </div>

        <Select
          label="공개 범위"
          value={visibility}
          onValueChange={(v) => setVisibility(v as 'PRIVATE' | 'ORG')}
          options={[
            { value: 'PRIVATE', label: '개인 일정 (나만 보기)' },
            { value: 'ORG', label: '조직 일정 (소속 구성원 공유)' },
          ]}
        />

        {visibility === 'ORG' && (
          <Select
            label="공유 조직"
            value={orgUnitId}
            onValueChange={setOrgUnitId}
            options={orgOptions}
            placeholder="조직을 선택하세요"
          />
        )}

        <Input
          label="장소"
          placeholder="예: 본사 3층 회의실"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />

        <Input
          label="메모"
          placeholder="상세 내용"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              marginBottom: 8,
              color: 'var(--ark-color-text-secondary)',
            }}
          >
            색상
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
              삭제
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={!title.trim() || saving || (visibility === 'ORG' && !orgUnitId)}
          >
            저장
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, fontSize: 14 }}>
      <span style={{ minWidth: 48, color: 'var(--ark-color-text-secondary)' }}>{label}</span>
      <span style={{ color: 'var(--ark-color-text)' }}>{value}</span>
    </div>
  );
}
