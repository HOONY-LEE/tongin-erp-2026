import { Fragment, type CSSProperties, type ReactNode } from 'react';
import {
  Archive,
  BatteryFull,
  BellOff,
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CornerUpLeft,
  Hash,
  Image,
  Mic,
  Phone,
  Plus,
  Signal,
  Smile,
  SquarePen,
  Trash2,
  User,
  Video,
  Wifi,
} from 'lucide-react';
import styles from './PhonePreview.module.css';

export type PreviewChannel = 'SMS' | 'ALIMTALK' | 'EMAIL' | 'INSTAGRAM';

const hhmm = (d: Date) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
const ampm = (d: Date) => {
  const h = d.getHours();
  return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const URL_RE = /(https?:\/\/[^\s]+)/g;
/** 본문 속 링크(http…)를 눌러 갈 수 있는 밑줄 링크로 */
export function linkify(text: string): ReactNode {
  return text.split(URL_RE).map((part, i) =>
    i % 2 === 1 ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer" className={styles.link}>
        {part}
      </a>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

interface Props {
  channel?: PreviewChannel;
  /** 발신자 이름(알림톡 채널·메일 보낸 사람·인스타 계정) */
  sender: string;
  /** 문자 발신번호 — 저장 안 된 번호처럼 보인다 */
  senderNo?: string;
  /** 문자: 장문(LMS)이면 제목 줄을 붙인다(제목이 없으면 '제목없음' — 실제 휴대폰과 같게) */
  lms?: boolean;
  /** 장문 제목 · 알림톡 강조 제목 · 메일 제목 */
  title?: string;
  /** 본문(고객명·광고 문구가 들어간 최종 문장). 비었으면 placeholder */
  body: string;
  placeholder?: string;
  /** 받는 사람 이름(메일 받는 사람 칸) */
  to?: string;
  /** 받은 시각(예약 발송이면 예약 시각) */
  at?: Date;
  /** 좁은 자리(발송 단계)에 작게 */
  compact?: boolean;
  /** 폭을 직접 정할 때(px) — 높이는 아이폰 비율로 따라온다 */
  width?: number;
}

/** 고객 휴대폰(아이폰) 화면 그대로의 미리보기 — 채널마다 그 앱의 화면으로 */
export function PhonePreview(props: Props) {
  const { channel = 'SMS', compact } = props;
  const at = props.at ?? new Date();
  return (
    <div
      className={`${styles.frame} ${compact ? styles.compact : ''}`}
      style={props.width ? ({ '--w': `${props.width}px` } as CSSProperties) : undefined}
      aria-label="휴대폰 미리보기"
    >
      <div className={`${styles.screen} ${styles[`screen${channel}`] ?? ''}`}>
        <div className={styles.status}>
          <span className={styles.clock}>
            {hhmm(new Date())}
            {channel === 'SMS' && <BellOff size={12} />}
          </span>
          <span className={styles.island} />
          <span className={styles.statusIcons}>
            <Signal size={13} />
            <Wifi size={13} />
            <BatteryFull size={17} />
          </span>
        </div>
        {channel === 'SMS' && <SmsScreen {...props} at={at} />}
        {channel === 'ALIMTALK' && <KakaoScreen {...props} at={at} />}
        {channel === 'EMAIL' && <MailScreen {...props} at={at} />}
        {channel === 'INSTAGRAM' && <InstaScreen {...props} at={at} />}
        <span className={styles.home} />
      </div>
    </div>
  );
}

const bodyOf = (p: Props) =>
  p.body ? linkify(p.body) : <span className={styles.placeholder}>{p.placeholder}</span>;

/** 아이폰 기본 메시지 앱 — 저장 안 된 번호에서 온 문자 */
function SmsScreen(p: Props & { at: Date }) {
  return (
    <>
      <div className={styles.smsNav}>
        <span className={styles.smsBack}>
          <ChevronLeft size={20} />
        </span>
        <div className={styles.smsContact}>
          <span className={styles.smsAvatar}>
            <User size={26} fill="currentColor" strokeWidth={0} />
          </span>
          <span className={styles.smsNumber}>
            {p.senderNo ?? p.sender}
            <ChevronRight size={10} />
          </span>
        </div>
      </div>
      <div className={styles.thread}>
        <div className={styles.smsMeta}>(오늘) {ampm(p.at)}</div>
        <div className={styles.smsBubble}>
          {p.lms && <b className={styles.smsSubject}>{p.title?.trim() || '제목없음'}</b>}
          <span>[Web발신]</span>
          {'\n'}
          {bodyOf(p)}
        </div>
      </div>
      <div className={styles.smsComposer}>
        <span className={styles.smsPlus}>
          <Plus size={17} />
        </span>
        <span className={styles.smsInput}>
          문자 메시지 · SMS
          <Mic size={14} />
        </span>
      </div>
    </>
  );
}

/** 카카오톡 — 알림톡 */
function KakaoScreen(p: Props & { at: Date }) {
  return (
    <>
      <div className={styles.kNav}>
        <ChevronLeft size={20} />
        <b>{p.sender}</b>
        <span className={styles.kNavIcons}>
          <Hash size={15} />
        </span>
      </div>
      <div className={`${styles.thread} ${styles.kThread}`}>
        <div className={styles.kRow}>
          <span className={styles.kAvatar}>{p.sender.slice(0, 1)}</span>
          <div className={styles.kCol}>
            <span className={styles.kName}>{p.sender}</span>
            <div className={styles.kTimeRow}>
              <div className={styles.kCard}>
                <div className={styles.kHead}>알림톡 도착</div>
                <div className={styles.kBody}>
                  {p.title?.trim() && <b className={styles.kTitle}>{p.title}</b>}
                  {bodyOf(p)}
                </div>
                <div className={styles.kButton}>자세히 보기</div>
              </div>
              <span className={styles.kTime}>{ampm(p.at)}</span>
            </div>
          </div>
        </div>
      </div>
      <div className={styles.kComposer}>
        <Plus size={18} />
        <span className={styles.kInput} />
        <Smile size={17} />
        <Hash size={16} />
      </div>
    </>
  );
}

/** 아이폰 메일 앱 — 받은 메일 한 통 */
function MailScreen(p: Props & { at: Date }) {
  return (
    <>
      <div className={styles.mNav}>
        <span className={styles.mBack}>
          <ChevronLeft size={18} /> 받은 편지함
        </span>
        <span className={styles.mArrows}>
          <ChevronUp size={18} />
          <ChevronDown size={18} />
        </span>
      </div>
      <div className={`${styles.thread} ${styles.mThread}`}>
        <div className={styles.mFrom}>
          <span className={styles.mAvatar}>{p.sender.slice(0, 1)}</span>
          <div className={styles.mFromText}>
            <b>{p.sender}</b>
            <span>받는 사람: {p.to ?? '고객'}</span>
          </div>
          <span className={styles.mDate}>{ampm(p.at)}</span>
        </div>
        <b className={styles.mSubject}>{p.title?.trim() || '(제목 없음)'}</b>
        <div className={styles.mBody}>{bodyOf(p)}</div>
      </div>
      <div className={styles.mToolbar}>
        <Trash2 size={17} />
        <Archive size={17} />
        <CornerUpLeft size={17} />
        <SquarePen size={17} />
      </div>
    </>
  );
}

/** 인스타그램 DM */
function InstaScreen(p: Props & { at: Date }) {
  return (
    <>
      <div className={styles.iNav}>
        <ChevronLeft size={20} />
        <span className={styles.iAvatar}>
          <span>{p.sender.slice(0, 1)}</span>
        </span>
        <div className={styles.iWho}>
          <b>{p.sender}</b>
          <span>Instagram</span>
        </div>
        <span className={styles.iNavIcons}>
          <Phone size={17} />
          <Video size={19} />
        </span>
      </div>
      <div className={`${styles.thread} ${styles.iThread}`}>
        <div className={styles.iMeta}>{ampm(p.at)}</div>
        <div className={styles.iRow}>
          <span className={styles.iMini}>{p.sender.slice(0, 1)}</span>
          <div className={styles.iBubble}>{bodyOf(p)}</div>
        </div>
      </div>
      <div className={styles.iComposer}>
        <span className={styles.iCam}>
          <Camera size={15} />
        </span>
        <span className={styles.iInput}>메시지 보내기...</span>
        <Mic size={16} />
        <Image size={16} />
      </div>
    </>
  );
}
