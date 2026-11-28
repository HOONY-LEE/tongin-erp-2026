import i18n from '../i18n';
import { useSyncExternalStore } from 'react';
import { UA, WebSocketInterface, debug as jssipDebug } from 'jssip';
import type { RTCSession } from 'jssip/lib/RTCSession';
import { api, ApiError, getToken } from './api';

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
  /** 인터넷이 잠깐 끊겨 통화 연결을 다시 잡는 중 */
  reconnecting?: boolean;
}
export interface PhoneState {
  status: PhoneStatus;
  error: string | null;
  call: PhoneCall | null;
  /** 지금 전화가 울리는 상태(상담 가능 · 열린 콜 없음 → 한국AI통신에 등록됨) */
  ringable: boolean;
  /** 켜 두었지만 다른 창(새 창으로 띄운 상담 콘솔 등)이 PC 전화를 쓰는 중 */
  elsewhere?: boolean;
}

const ENABLED_KEY = 'tongin_pc_phone';
/** 토큰 만료 몇 분 전에 새로 받아 다시 등록할지 */
const REFRESH_BEFORE_MS = 10 * 60_000;

let state: PhoneState = { status: 'off', error: null, call: null, ringable: false };
const listeners = new Set<() => void>();
const set = (patch: Partial<PhoneState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
  // 넘겨주기를 기다리던 중 통화가 끝났으면 이제 넘긴다
  if (handoffPending && !session && !state.call) queueMicrotask(() => handOffIfIdle());
};

/*
 * 여러 창(두 모니터) — PC 전화는 한 창에서만 켠다(두 창이 같이 울리지 않게).
 * 웹 잠금(navigator.locks)을 쥔 창이 주인이고, 다른 창이 켜려 하면(상담 콘솔을 새 창으로 띄우면 자동)
 * 주인 창에 '넘겨 줘'를 보낸다. 주인은 통화 중이 아니면 바로, 통화 중이면 통화가 끝난 뒤 넘긴다.
 * 주인 창을 닫으면 켜 두었던 다른 창이 이어받는다.
 */
const LOCK_NAME = 'tongin-pc-phone';
const chan: BroadcastChannel | null =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('tongin-pc-phone') : null;
let lockHeld = false;
let releaseLock: (() => void) | null = null;
let handoffPending = false;
/** 이 창이 넘겨받기를 기다리는 중 */
let wantPending = false;

function tryLock(): Promise<boolean> {
  if (lockHeld) return Promise.resolve(true);
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks) return Promise.resolve(true);
  return new Promise((resolve) => {
    locks
      .request(LOCK_NAME, { ifAvailable: true }, (lock) => {
        if (!lock) {
          resolve(false);
          return undefined;
        }
        lockHeld = true;
        resolve(true);
        return new Promise<void>((r) => {
          releaseLock = r;
        });
      })
      .catch(() => resolve(false));
  });
}
/** 잠금이 풀릴 때까지 기다렸다가 쥔다(넘겨받기) — 풀린 순간 바로 이 창 차지 */
function waitLock(): Promise<void> {
  if (lockHeld) return Promise.resolve();
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks) return Promise.resolve();
  return new Promise((resolve) => {
    void locks
      .request(LOCK_NAME, () => {
        lockHeld = true;
        resolve();
        return new Promise<void>((r) => {
          releaseLock = r;
        });
      })
      .catch(() => resolve());
  });
}
function dropLock() {
  lockHeld = false;
  releaseLock?.();
  releaseLock = null;
}
const enabledFlag = () => {
  try {
    return localStorage.getItem(ENABLED_KEY) === '1';
  } catch {
    return false;
  }
};

/** 이 창의 PC 전화를 내려놓고 다른 창이 넘겨받게 한다 — 서버에는 끄지 않는다 */
function handOff() {
  handoffPending = false;
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
  refreshPending = false;
  if (statePoll) clearInterval(statePoll);
  statePoll = null;
  const old = ua;
  ua = null;
  old?.stop();
  set({ status: 'off', error: null, call: null, ringable: false, elsewhere: true });
  dropLock();
  chan?.postMessage({ t: 'released' });
}
function handOffIfIdle() {
  if (handoffPending && !session && !state.call) handOff();
}

chan?.addEventListener('message', (e: MessageEvent<{ t: string }>) => {
  const t = e.data?.t;
  if (t === 'want' && (lockHeld || ua)) {
    if (session || state.call) handoffPending = true;
    else handOff();
  } else if (t === 'bye' && (wantPending || state.elsewhere) && enabledFlag()) {
    // 주인 창이 닫혔다 — 닫힌 창의 '꺼짐' 알림보다 늦게 켜지도록 조금 기다린다
    wantPending = false;
    setTimeout(() => void enablePhone(), 1500);
  }
});
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
/**
 * 동시 울림(소프트폰) 방식 — 한국AI통신은 그 순간 등록된 PC만 울린다.
 * 그래서 상담 가능이고 열린 콜이 없을 때만 등록하고, 상담 중·자리 비움이면 등록을 푼다.
 */
let wantRing = false;
let statePoll: ReturnType<typeof setInterval> | null = null;
/** 울리는 전화의 한국AI통신 통화 ID(INVITE 헤더에 있으면) */
let incomingSid: string | null = null;

function applyRegistration() {
  const u = ua;
  if (!u || !u.isConnected()) return;
  if (wantRing && !session && !u.isRegistered()) u.register();
  else if ((!wantRing || session) && u.isRegistered()) u.unregister({ all: false });
}
/** 상담 콘솔·서버 상태로 '울려도 되는지'를 정한다(바로 반영) */
export function setRingable(ring: boolean) {
  if (wantRing === ring) return;
  wantRing = ring;
  applyRegistration();
}
async function pollAgentState() {
  try {
    const r = await api<{ ringable: boolean }>('/cs-calls/agent/state');
    setRingable(r.ringable);
  } catch {
    /* 다음 확인 때 다시 */
  }
}

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
        label:
          d.label || `${kind === 'audioinput' ? i18n.t('cc.mic') : i18n.t('cc.speaker')} ${i + 1}`,
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
    watchNetwork(s, e.peerconnection);
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
    applyRegistration();
  };
  s.on('ended', end);
  s.on('failed', end);
}

/**
 * 통화 중 인터넷이 잠깐 끊기면 — 음성 연결(ICE)이 끊김/실패로 바뀐다.
 * 잠깐(몇 초)이면 브라우저가 스스로 되살리고, 실패로 가거나 인터넷이 돌아오면(online)
 * 경로를 새로 잡는다(ICE restart 재협상). 서버 연결(웹소켓)이 끊겼으면 다시 붙은 뒤에 한다.
 */
function watchNetwork(s: RTCSession, pc: RTCPeerConnection) {
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  const restart = () => {
    if (session !== s || !s.isEstablished()) return;
    const ok = ['connected', 'completed'].includes(pc.iceConnectionState);
    if (ok) return;
    if (!ua?.isConnected()) {
      ua?.once('connected', () => setTimeout(restart, 500));
      return;
    }
    try {
      s.renegotiate({ rtcOfferConstraints: { iceRestart: true } });
    } catch {
      /* 재협상 중이면 다음 기회에 */
    }
  };
  const onState = () => {
    if (session !== s) return;
    const st = pc.iceConnectionState;
    if (st === 'connected' || st === 'completed') {
      if (restartTimer) clearTimeout(restartTimer);
      restartTimer = null;
      if (state.call?.reconnecting) setCall({ reconnecting: false });
      return;
    }
    if (st === 'disconnected' || st === 'failed') {
      if (!state.call?.reconnecting) setCall({ reconnecting: true });
      // 끊김은 3초 기다려 보고(스스로 돌아오는 경우가 많다), 실패는 바로 다시 잡는다
      if (restartTimer) clearTimeout(restartTimer);
      restartTimer = setTimeout(restart, st === 'failed' ? 0 : 3000);
    }
  };
  pc.addEventListener('iceconnectionstatechange', onState);
  const onOnline = () => setTimeout(restart, 1000);
  window.addEventListener('online', onOnline);
  const cleanup = () => {
    if (restartTimer) clearTimeout(restartTimer);
    window.removeEventListener('online', onOnline);
  };
  s.on('ended', cleanup);
  s.on('failed', cleanup);
}

/** 통화 중 새로고침·창 닫기 — 브라우저가 '나가시겠습니까?'를 묻게 한다(나가면 통화가 끊긴다) */
if (typeof window !== 'undefined')
  window.addEventListener('beforeunload', (e) => {
    if (!session) return;
    e.preventDefault();
    e.returnValue = '';
  });
/** 그래도 나가면 — 고객이 무음 속에 기다리지 않게 끊는 신호(BYE)를 보내 본다(이어 받을 수는 없다) */
if (typeof window !== 'undefined')
  window.addEventListener('pagehide', () => {
    try {
      session?.terminate();
    } catch {
      /* 무시 */
    }
  });

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
    // 상담원(고객관리부)이 아니면 PC 전화를 쓸 수 없다 — 켜 둔 기억을 지우고 조용히 끈다
    if (e instanceof ApiError && e.status === 403) {
      try {
        localStorage.removeItem(ENABLED_KEY);
      } catch {
        /* 무시 */
      }
      set({ status: 'off', error: null });
      return;
    }
    set({ status: 'error', error: e instanceof Error ? e.message : i18n.t('cc.pcFailed') });
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
    // 등록은 상담 가능일 때만 직접 한다(applyRegistration)
    register: false,
    session_timers: false,
  });
  next.on('registered', () => ua === next && set({ ringable: true }));
  next.on('unregistered', () => ua === next && set({ ringable: false }));
  next.on('registrationFailed', () => {
    if (ua !== next) return;
    set({ ringable: false, error: i18n.t('cc.regFailed') });
  });
  next.on('disconnected', () => {
    if (ua === next && state.status === 'ready')
      set({
        status: 'connecting',
        ringable: false,
        error: i18n.t('cc.reconnecting'),
      });
  });
  next.on('connected', () => {
    if (ua !== next) return;
    set({ status: 'ready', error: null });
    applyRegistration();
  });
  next.on(
    'newRTCSession',
    (e: {
      session: RTCSession;
      originator: 'local' | 'remote';
      request?: {
        getHeader?: (n: string) => string | undefined;
        headers?: Record<string, unknown>;
      };
    }) => {
      if (e.originator !== 'remote') return;
      // 한국AI통신 통화 ID — 헤더 이름이 문서에 없어 X- 헤더 중 'CA…' 값을 찾는다(없으면 서버가 번호로 잇는다)
      incomingSid = null;
      const headers = e.request?.headers ?? {};
      for (const [k, v] of Object.entries(headers)) {
        if (!/^x-/i.test(k)) continue;
        const raw = Array.isArray(v) ? (v[0] as { raw?: string })?.raw : undefined;
        if (raw && /^CA[0-9a-f]{16,}$/i.test(raw.trim())) incomingSid = raw.trim();
      }
      // 이미 통화 중이면 새 전화는 거절(통화 중) — 서버가 다음 상담원으로 넘긴다
      if (session) {
        e.session.terminate({ status_code: 486, reason_phrase: 'Busy Here' });
        return;
      }
      const from = e.session.remote_identity?.uri?.user ?? '';
      attachSession(e.session, 'in', from.replace(/\D/g, ''));
    },
  );
  ua = next;
  next.start();
  scheduleRefresh(res.expiresAt);
  if (old) old.stop();
  // 상담 가능 여부를 서버에서 주기적으로 확인해 등록/해제(다른 화면에 있어도)
  if (!statePoll) statePoll = setInterval(() => void pollAgentState(), 5000);
  void pollAgentState();
}

/** PC 전화 켜기 — 마이크 권한을 먼저 받는다 */
/** 지금 PC 전화 상태(훅 밖에서 바로 확인할 때) */
export function getPhoneState(): PhoneState {
  return state;
}

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
          ? i18n.t('cc.noMic')
          : name === 'NotReadableError'
            ? i18n.t('cc.micBusy')
            : i18n.t('cc.micBlocked'),
    });
    return;
  }
  try {
    localStorage.setItem(ENABLED_KEY, '1');
  } catch {
    /* 저장 못 해도 이번 화면에서는 켜진다 */
  }
  // 다른 창이 쓰는 중이면 넘겨 달라고 하고, 그 창이 내려놓을 때까지 기다린다(통화 중이면 통화가 끝난 뒤)
  if (!(await tryLock())) {
    if (wantPending) return;
    wantPending = true;
    set({ status: 'connecting', error: null, elsewhere: false });
    chan?.postMessage({ t: 'want' });
    await waitLock();
    wantPending = false;
  }
  set({ elsewhere: false });
  await register();
}

/** 이 창으로 PC 전화를 가져온다(상담 콘솔을 연 창) — 켜 두었을 때만 */
export function claimPhone() {
  if (!enabledFlag() || lockHeld || wantPending) return;
  void enablePhone();
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
  if (statePoll) clearInterval(statePoll);
  statePoll = null;
  wantRing = false;
  wantPending = false;
  handoffPending = false;
  session?.terminate();
  ua?.stop();
  ua = null;
  set({ status: 'off', error: null, call: null, ringable: false, elsewhere: false });
  dropLock();
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
  if (!on || state.status !== 'off') return;
  // 다른 창이 이미 쓰고 있으면 그 창에 둔다(이 창은 '다른 창에서 사용 중')
  void tryLock().then((ok) => {
    if (ok) void enablePhone();
    else set({ elsewhere: true });
  });
}

/** 받는 전화의 고객(수신 창에서 찾은 것) — 상담 화면을 서버 응답 전에 바로 열 때 쓴다 */
export interface CallerHint {
  existing: boolean;
  name: string | null;
}
export function answer(hint?: CallerHint | null) {
  if (!session || state.call?.state !== 'ringing') return;
  // 받으면 서버에 '내가 받았다' — 콜을 만들고 상담 중으로(다른 PC는 한국AI통신이 울림을 멈춘다).
  // 상담 화면은 서버를 기다리지 않고 바로 연다(answering) → 서버가 만든 콜이 오면 바꿔 끼운다(changed)
  const number = state.call.number;
  window.dispatchEvent(
    new CustomEvent('tongin:cs-call-answering', { detail: { phone: number, ...hint } }),
  );
  void api('/cs-calls/answer', {
    method: 'POST',
    body: JSON.stringify({ phone: number, ...(incomingSid && { katCallSid: incomingSid }) }),
  })
    .then((r) => window.dispatchEvent(new CustomEvent('tongin:cs-call-changed', { detail: r })))
    .catch(() => window.dispatchEvent(new CustomEvent('tongin:cs-call-changed')));
  setRingable(false);
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

/**
 * 울리는 전화 거절 — '통화 중(486)'으로 답한다. 기본값(480)은 한국AI통신이 바로 끝내지 않고
 * 시간이 다 될 때까지 고객 쪽이 계속 울린다. 거절하면 서버가 다음 상담원 → 없으면 아웃콜·안내 문자.
 */
export function decline() {
  if (session && state.call?.state === 'ringing' && state.call.direction === 'in')
    session.terminate({ status_code: 486, reason_phrase: 'Busy Here' });
  else session?.terminate();
}

export function toggleMute() {
  if (!session || !state.call) return;
  if (state.call.muted) session.unmute({ audio: true });
  else session.mute({ audio: true });
  setCall({ muted: !state.call.muted });
}

/**
 * 돌려주기(블라인드) — 지금 통화를 다른 번호로 넘긴다. 한국AI통신에 SIP REFER를 보내고,
 * 상대가 받았다는 알림(NOTIFY 200)이 오면 내 쪽 통화를 끊는다. 못 넘기면 통화는 그대로 이어진다.
 */
export function transferCall(number: string): Promise<{ ok: boolean; reason?: string }> {
  const to = number.replace(/\D/g, '');
  const s = session;
  if (!s || state.call?.state !== 'active' || !to)
    return Promise.resolve({ ok: false, reason: i18n.t('cc.notInCall') });
  return new Promise((resolve) => {
    let done = false;
    let sent = false;
    const finish = (r: { ok: boolean; reason?: string }) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      s.off('ended', onEnded);
      resolve(r);
    };
    // 넘기는 쪽 서버가 먼저 내 통화를 끊어도 성공으로 본다
    const onEnded = () => sent && finish({ ok: true });
    s.on('ended', onEnded);
    const timer = setTimeout(
      () => finish({ ok: false, reason: i18n.t('cc.noAnswerTimeout') }),
      40_000,
    );
    try {
      s.refer(`sip:${to}@${realm}`, {
        eventHandlers: {
          requestSucceeded: () => {
            sent = true;
          },
          requestFailed: (e: { response?: { status_code?: number } | null; cause?: string }) =>
            finish({
              ok: false,
              reason: i18n.t('cc.transferRejected', {
                v0: e.response?.status_code ?? e.cause ?? i18n.t('cc.decline'),
              }),
            }),
          accepted: () => {
            finish({ ok: true });
            if (session === s) s.terminate();
          },
          failed: (e: { status_line?: { status_code?: number; reason_phrase?: string } }) =>
            finish({
              ok: false,
              reason: i18n
                .t('cc.notConnected', {
                  v0: e.status_line?.status_code ?? '',
                  v1: e.status_line?.reason_phrase ?? '',
                })
                .trim(),
            }),
        },
      });
    } catch (e) {
      finish({ ok: false, reason: e instanceof Error ? e.message : i18n.t('cc.transferFailed') });
    }
  });
}

/** 통화 중 숫자 키 누르기(ARS 인증번호·자동 응답 메뉴) */
export function sendDtmf(tone: string) {
  if (!session || state.call?.state !== 'active') return;
  session.sendDTMF(tone, { duration: 120, interToneGap: 70 });
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
    // 다른 창이 이어받게 알린다
    chan?.postMessage({ t: 'bye' });
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
