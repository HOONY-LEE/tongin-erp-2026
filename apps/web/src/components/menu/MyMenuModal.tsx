import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { normalizeLayout, type MenuGroup } from '@tongin/shared';
import { Button, Modal, useToast } from '../ui';
import { ApiError } from '../../lib/api';
import { resetMyMenu, saveMyMenu, type MyMenu } from '../../lib/menu';
import { MenuLayoutEditor } from './MenuLayoutEditor';
import styles from './menuEditor.module.css';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  menu: MyMenu;
  /** 권한이 있어 지금 보이는 메뉴인가 — 권한 없는 메뉴는 편집 목록에서도 뺀다 */
  visible: (key: string) => boolean;
}

/** 내 사이드바 메뉴 편집 — 받은 메뉴 안에서 순서·묶음·숨김 */
export function MyMenuModal({ open, onOpenChange, menu, visible }: Props) {
  const toast = useToast();
  const [groups, setGroups] = useState<MenuGroup[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    // 숨긴 메뉴도 제자리에 둔 편집용 배치(예전 캐시엔 없으면 보이는 배치) — 빈 묶음도 편집에선 보이게
    setGroups(
      normalizeLayout(menu.editor ?? menu.layout).groups.map((g) => ({
        ...g,
        items: g.items.filter(visible),
      })),
    );
    setHidden(menu.hidden.filter(visible));
  }, [open]);

  const save = async () => {
    setSaving(true);
    try {
      await saveMyMenu({ groups, hidden });
      toast({ type: 'success', title: '내 메뉴를 저장했습니다' });
      onOpenChange(false);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '저장하지 못했습니다' });
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!window.confirm('팀 기본 메뉴로 되돌릴까요? 내가 바꾼 순서·숨김이 사라집니다.')) return;
    setSaving(true);
    try {
      await resetMyMenu();
      toast({ type: 'success', title: '팀 기본 메뉴로 되돌렸습니다' });
      onOpenChange(false);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '되돌리지 못했습니다' });
    } finally {
      setSaving(false);
    }
  };

  const from = menu.profiles.map((p) => p.name).join(' + ');

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="내 메뉴 편집"
      size="lg"
      footer={
        <>
          <Button
            variant="ghost"
            leftIcon={<RotateCcw size={14} />}
            disabled={!menu.personalized || saving}
            onClick={() => void reset()}
            style={{ marginRight: 'auto' }}
          >
            팀 기본으로 되돌리기{from && ` (${from})`}
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            저장
          </Button>
        </>
      }
    >
      <div className={styles.personalBody}>
        <MenuLayoutEditor
          mode="personal"
          groups={groups}
          onChange={setGroups}
          hidden={hidden}
          onHiddenChange={setHidden}
        />
      </div>
    </Modal>
  );
}
