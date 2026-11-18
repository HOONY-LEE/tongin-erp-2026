import { useSyncExternalStore } from 'react';
import { UA, WebSocketInterface, debug as jssipDebug } from 'jssip';
import type { RTCSession } from 'jssip/lib/RTCSession';
import { api, getToken } from './api';

/**
 * PC 전화(브라우저 WebRTC) — 상담원이 전화기 없이 상담 콘솔에서 헤드셋으로 받고 건다.
 *
 * 흐름: 서버(/cs-calls/agent/phone-token)가 한국AI통신에서 1시간짜리 SIP 토큰을 받아 주면
 * JsSIP로 SIP 등록(register)한다. 서버는 이 브라우저의 SIP 주소를 저장해 두었다가, 대표번호로 온
 * 전화가 이 상담원에게 배분되면 <Dial><Sip>로 이 브라우저를 울린다.
 *
 * 화면(라우트)이 바뀌어도 통화가 끊기지 않도록 상태와 전화(UA)는 이 모듈에 둔다.
 * 레이아웃의 SoftphoneBar가 울림·통화 중 표시를, 상담 콘솔이 켜기/끄기를 맡는다.
 */

export type PhoneStatus = 'off' | 'connecting' | 'ready' | 'error';
export interface PhoneCall {
  direction: 'in' | 'out';
  /** 상대 번호(숫자) */
  number: string;
  state: 'ringing' | 'connecting' | 'active';
  startedAt: number | null;
  muted: boolean;
  /** 고객 소리 문제 — null이면 정상. 'blocked'(브라우저가 재생을 막음) | 'no-media'(고객 음성이 들어오지 않음) */
  audioIssue: 'blocked' | 'no-media' | null;
}
export interface PhoneState {
  status: PhoneStatus;
  error: string | null;
  call: PhoneCall | null;
}

const ENABLED_KEY = 'tongin_pc_phone';
/** 토큰 만료 몇 분 전에 새로 받아 다시 등록할지 */
const REFRESH_BEFORE_MS = 10 * 60_000;

let state: PhoneState = { status: 'off', error: null, call: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<PhoneState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
const setCall = (patch: Partial<PhoneCall> | null) =>
  set({ call: patch === null ? null : state.call ? { ...state.call, ...patch } : null });

let ua: UA | null = null;
let session: RTCSession | null = null;
let iceServers: RTCIceServer[] = [];
let callerId = '';
let realm = '';
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
/** 통화 중에 토큰 갱신 시각이 오면 통화가 끝난 뒤 갱신한다 */
let refreshPending = false;

jssipDebug.disable();

// ── 소리 설정 — 이 PC(브라우저)에만 저장 ──
export type RingStyle = 'classic' | 'soft' | 'bell';
export interface PhoneSettings {
  /** 벨소리 켜기 */
  ring: boolean;
  /** 벨소리 크기 0~1 */
  volume: number;
  ringStyle: RingStyle;
  /** 소리 나는 곳(스피커·헤드셋) — 비우면 기본 장치 */
  outputDeviceId: string;
  /** 마이크 — 비우면 기본 장치 */
  inputDeviceId: string;
}
const SETTINGS_KEY = 'tongin_pc_phone_settings';
const DEFAULT_SETTINGS: PhoneSettings = {
  ring: true,
  volume: 0.6,
  ringStyle: 'classic',
  outputDeviceId: '',
  inputDeviceId: '',
};
let settings: PhoneSettings = (() => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw
      ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<PhoneSettings>) }
      : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
})();
const settingsListeners = new Set<() => void>();
export function getPhoneSettings() {
  return settings;
}
export function setPhoneSettings(patch: Partial<PhoneSettings>) {
  settings = { ...settings, ...patch };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* 저장 못 해도 이번 화면에서는 적용된다 */
  }
  if (audioEl && 'outputDeviceId' in patch) void applySink(audioEl);
  settingsListeners.forEach((l) => l());
}
export function usePhoneSettings(): PhoneSettings {
  return useSyncExternalStore(
    (l) => {
      settingsListeners.add(l);
      return () => settingsListeners.delete(l);
    },
    () => settings,
  );
}
/** 고를 수 있는 마이크·스피커 목록(마이크 권한을 받은 뒤에야 이름이 보인다) */
export async function listAudioDevices() {
  const all = await navigator.mediaDevices.enumerateDevices().catch(() => []);
  const pick = (kind: MediaDeviceKind) =>
    all
      .filter(
        (d) =>
          d.kind === kind &&
          // 권한 전에는 deviceId가 빈 값으로 온다 — 고를 수 없으니 뺀다
          !!d.deviceId &&
          d.deviceId !== 'default' &&
          d.deviceId !== 'communications',
      )
      .map((d, i) => ({
        value: d.deviceId,
        label: d.label || `${kind === 'audioinput' ? '마이크' : '스피커'} ${i + 1}`,
      }));
  return { inputs: pick('audioinput'), outputs: pick('audiooutput') };
}
const micConstraint = (): MediaTrackConstraints | boolean =>
  settings.inputDeviceId ? { deviceId: { exact: settings.inputDeviceId } } : true;

type SinkTarget = { setSinkId?: (id: string) => Promise<void> };
async function applySink(target: SinkTarget) {
  if (!settings.outputDeviceId || typeof target.setSinkId !== 'function') return;
  await target.setSinkId(settings.outputDeviceId).catch(() => undefined);
}

let audioEl: HTMLAudioElement | null = null;
const remoteAudio = () => {
  if (!audioEl) {
    audioEl = document.createElement('audio');
    audioEl.autoplay = true;
    audioEl.style.display = 'none';
    document.body.appendChild(audioEl);
    void applySink(audioEl as unknown as SinkTarget);
  }
  return audioEl;
};

/** 벨소리 모양 — [시작(초), 높이(Hz), 길이(초)] */
const RING_PATTERNS: Record<
  RingStyle,
  { notes: [number, number, number][]; every: number; wave: OscillatorType }
> = {
  classic: {
    notes: [
      [0, 880, 0.15],
      [0.18, 660, 0.15],
      [0.36, 880, 0.15],
    ],
    every: 1800,
    wave: 'sine',
  },
  soft: {
    notes: [
      [0, 523, 0.35],
      [0.4, 659, 0.45],
    ],
    every: 2400,
    wave: 'triangle',
  },
  bell: {
    notes: [
      [0, 1046, 0.6],
      [0.25, 1318, 0.6],
    ],
    every: 2000,
    wave: 'sine',
  },
};
let ring: { ctx: AudioContext; timer: ReturnType<typeof setInterval> } | null = null;
function makeRing(style: RingStyle, volume: number) {
  const ctx = new AudioContext();
  void applySink(ctx as unknown as SinkTarget);
  const p = RING_PATTERNS[style];
  const play = () => {
    for (const [at, f, len] of p.notes) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = p.wave;
      o.frequency.value = f;
      const t0 = ctx.currentTime + at;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.25 * volume), t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
      o.connect(g).connect(ctx.destination);
      o.start(t0);
      o.stop(t0 + len + 0.05);
    }
  };
  return { ctx, play, every: p.every };
}
/** 벨소리 — 별도 음원 없이 WebAudio로 반복. 설정에서 끄면 화면 표시만 */
function startRingtone() {
  if (ring || !settings.ring || settings.volume <= 0) return;
  try {
    const r = makeRing(settings.ringStyle, settings.volume);
    r.play();
    ring = { ctx: r.ctx, timer: setInterval(r.play, r.every) };
  } catch {
    // 소리를 못 내도 화면 표시는 된다
  }
}
function stopRingtone() {
  if (!ring) return;
  clearInterval(ring.timer);
  void ring.ctx.close();
  ring = null;
}
/** 설정 화면 '들어보기' — 한 번만 울린다 */
export function previewRingtone(style: RingStyle = settings.ringStyle, volume = settings.volume) {
  try {
    const r = makeRing(style, volume);
    r.play();
    setTimeout(() => void r.ctx.close(), 1500);
  } catch {
    /* 무시 */
  }
}

const decodeJwt = (jwt: string) => {
  const b64 = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const json = decodeURIComponent(
    atob(b64)
      .split('')
      .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
      .join(''),
  );
  return JSON.parse(json) as {
    sip_username: string;
    sip_password: string;
    realm: string;
    ws_url: string;
    allowed_caller_ids?: string[];
  };
};

function attachSession(s: RTCSession, direction: 'in' | 'out', number: string) {
  session = s;
  set({
    call: {
      direction,
      number,
      state: direction === 'in' ? 'ringing' : 'connecting',
      startedAt: null,
      muted: false,
      audioIssue: null,
    },
  });
  if (direction === 'in') startRingtone();
  /** 고객 음성 재생 — 트랙이 오면 바로 붙이고 명시적으로 재생한다(브라우저 자동재생 정책 대비) */
  const playRemote = (ev?: RTCTrackEvent) => {
    const pc = s.connection;
    if (!pc) return;
    const el = remoteAudio();
    const stream =
      ev?.streams?.[0] ??
      new MediaStream(
        pc
          .getReceivers()
          .map((r) => r.track)
          .filter((t): t is MediaStreamTrack => !!t && t.kind === 'audio'),
      );
    if (el.srcObject !== stream) el.srcObject = stream;
    el.muted = false;
    el.volume = 1;
    el.play().then(
      () => state.call?.audioIssue === 'blocked' && setCall({ audioIssue: null }),
      () => setCall({ audioIssue: 'blocked' }),
    );
  };
  s.on('peerconnection', (e: { peerconnection: RTCPeerConnection }) => {
    e.peerconnection.addEventListener('track', (ev) => playRemote(ev));
  });
  s.on('confirmed', () => {
    stopRingtone();
    playRemote();
    setCall({ state: 'active', startedAt: Date.now() });
    // 4초 뒤 고객 음성이 실제로 들어오는지 확인 — 안 들어오면 화면에 알린다(네트워크·방화벽 문제 진단용)
    setTimeout(() => void checkInbound(s), 4000);
  });
  const end = () => {
    stopRingtone();
    if (session === s) session = null;
    set({ call: null });
    if (audioEl) audioEl.srcObject = null;
    if (refreshPending) {
      refreshPending = false;
      void register();
    }
  };
  s.on('ended', end);
  s.on('failed', end);
}

/** 받은 음성 바이트 — 0이면 고객 소리가 PC까지 오지 않는 것(네트워크), 오는데 안 들리면 재생 문제 */
async function checkInbound(s: RTCSession) {
  if (session !== s || !s.connection) return;
  let bytes = 0;
  try {
    const stats = await s.connection.getStats();
    stats.forEach(
      (r: { type?: string; kind?: string; mediaType?: string; bytesReceived?: number }) => {
        if (r.type === 'inbound-rtp' && (r.kind ?? r.mediaType) === 'audio')
          bytes += r.bytesReceived ?? 0;
      },
    );
  } catch {
    return;
  }
  console.info('[PC 전화] 받은 음성 바이트', bytes, '재생 중', audioEl ? !audioEl.paused : false);
  if (bytes === 0) setCall({ audioIssue: 'no-media' });
  else if (audioEl?.paused) setCall({ audioIssue: 'blocked' });
}

/** '소리 다시 연결' — 사용자가 누르면(클릭) 브라우저가 재생을 허락한다 */
export function resumeAudio() {
  if (!audioEl) return;
  void audioEl.play().then(
    () => setCall({ audioIssue: null }),
    () => setCall({ audioIssue: 'blocked' }),
  );
}

function scheduleRefresh(expiresAt: string) {
  if (refreshTimer) clearTimeout(refreshTimer);
  const wait = Math.max(60_000, Date.parse(expiresAt) - Date.now() - REFRESH_BEFORE_MS);
  refreshTimer = setTimeout(() => {
    if (session) refreshPending = true;
    else void register();
  }, wait);
}

/** 토큰을 받아 SIP 등록한다(처음 켤 때와 토큰 갱신 때) */
async function register() {
  if (state.status !== 'ready') set({ status: 'connecting', error: null });
  let res: { token: string; iceServers: RTCIceServer[]; expiresAt: string };
  try {
    res = await api('/cs-calls/agent/phone-token', { method: 'POST' });
  } catch (e) {
    set({ status: 'error', error: e instanceof Error ? e.message : 'PC 전화를 켜지 못했습니다' });
    return;
  }
  const c = decodeJwt(res.token);
  iceServers = res.iceServers;
  callerId = c.allowed_caller_ids?.[0] ?? '';
  realm = c.realm;
  const old = ua;
  const next = new UA({
    sockets: [new WebSocketInterface(c.ws_url)],
    uri: `sip:${c.sip_username}@${c.realm}`,
    password: c.sip_password,
    register: true,
    session_timers: false,
  });
  next.on('registered', () => set({ status: 'ready', error: null }));
  next.on('registrationFailed', () =>
    set({ status: 'error', error: '전화 서비스에 등록하지 못했습니다. 다시 켜 주세요.' }),
  );
  next.on('disconnected', () => {
    if (ua === next && state.status === 'ready')
      set({ status: 'connecting', error: '전화 서비스 연결이 끊겨 다시 잇는 중입니다' });
  });
  next.on('connected', () => {
    if (ua === next && state.status === 'connecting' && state.error) set({ error: null });
  });
  next.on('newRTCSession', (e: { session: RTCSession; originator: 'local' | 'remote' }) => {
    if (e.originator !== 'remote') return;
    // 이미 통화 중이면 새 전화는 거절(통화 중) — 서버가 다음 상담원으로 넘긴다
    if (session) {
      e.session.terminate({ status_code: 486, reason_phrase: 'Busy Here' });
      return;
    }
    const from = e.session.remote_identity?.uri?.user ?? '';
    attachSession(e.session, 'in', from.replace(/\D/g, ''));
  });
  ua = next;
  next.start();
  scheduleRefresh(res.expiresAt);
  if (old) old.stop();
}

/** PC 전화 켜기 — 마이크 권한을 먼저 받는다 */
export async function enablePhone() {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: micConstraint() });
    s.getTracks().forEach((t) => t.stop());
  } catch (e) {
    const name = e instanceof DOMException ? e.name : '';
    set({
      status: 'error',
      error:
        name === 'NotFoundError' || name === 'OverconstrainedError'
          ? '마이크(헤드셋)를 찾지 못했습니다. 헤드셋을 연결한 뒤 다시 켜 주세요.'
          : name === 'NotReadableError'
            ? '다른 프로그램이 마이크를 쓰고 있습니다. 화상회의 등 마이크를 쓰는 프로그램을 닫고 다시 켜 주세요.'
            : '마이크 사용이 막혀 있습니다. 주소창 왼쪽 아이콘에서 마이크를 허용하고, Mac은 시스템 설정 → 개인정보 보호 및 보안 → 마이크에서 Chrome을 켠 뒤 Chrome을 다시 실행해 주세요.',
    });
    return;
  }
  try {
    localStorage.setItem(ENABLED_KEY, '1');
  } catch {
    /* 저장 못 해도 이번 화면에서는 켜진다 */
  }
  await register();
}

/** PC 전화 끄기 — 서버에도 알려 이 브라우저로는 더 이상 울리지 않게 한다 */
export async function disablePhone() {
  try {
    localStorage.removeItem(ENABLED_KEY);
  } catch {
    /* 무시 */
  }
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
  refreshPending = false;
  session?.terminate();
  ua?.stop();
  ua = null;
  set({ status: 'off', error: null, call: null });
  await api('/cs-calls/agent/phone-off', { method: 'POST' }).catch(() => undefined);
}

/** 지난번에 켜 두었으면 다시 켠다(새로고침·재로그인 후) */
export function resumePhoneIfEnabled() {
  let on = false;
  try {
    on = localStorage.getItem(ENABLED_KEY) === '1';
  } catch {
    on = false;
  }
  if (on && state.status === 'off') void enablePhone();
}

export function answer() {
  if (!session || state.call?.state !== 'ringing') return;
  stopRingtone();
  // 클릭한 이 순간에 재생 장치를 열어 둔다 — 나중에 고객 음성이 와도 브라우저가 막지 않게
  void remoteAudio()
    .play()
    .catch(() => undefined);
  setCall({ state: 'connecting' });
  session.answer({
    mediaConstraints: { audio: micConstraint(), video: false },
    pcConfig: { iceServers },
  });
}

export function hangup() {
  session?.terminate();
}

export function toggleMute() {
  if (!session || !state.call) return;
  if (state.call.muted) session.unmute({ audio: true });
  else session.mute({ audio: true });
  setCall({ muted: !state.call.muted });
}

/** PC로 전화 걸기(콜백·아웃콜). callId — 상담 콜 id(통화 상태 알림이 이 콜에 통화 시간을 남긴다) */
export function dial(number: string, callId?: string) {
  const to = number.replace(/\D/g, '');
  if (!ua || state.status !== 'ready' || session || !to) return false;
  void remoteAudio()
    .play()
    .catch(() => undefined);
  const s = ua.call(`sip:${to}@${realm}`, {
    mediaConstraints: { audio: micConstraint(), video: false },
    pcConfig: { iceServers },
    fromUserName: callerId,
    extraHeaders: callId ? [`X-Call-Id: ${callId}`] : [],
  });
  attachSession(s, 'out', to);
  return true;
}

/** 창을 닫으면 서버에 PC 전화가 꺼졌다고 알린다(다음 전화가 닫힌 창으로 가지 않게) */
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    if (!ua) return;
    const token = getToken();
    void fetch('/api/cs-calls/agent/phone-off', {
      method: 'POST',
      keepalive: true,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).catch(() => undefined);
  });
}

export function usePhone(): PhoneState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}
