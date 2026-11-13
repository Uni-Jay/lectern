// One audio player for the whole app. It keeps reading while the student moves
// between tabs, courses and the home screen, until they pause or stop it.
//
// Three ways to speak, picked automatically:
//  - "claude":  the Claude voice, when the app runs as a Claude artifact.
//  - "server":  real MP3 audio from /api/tts on your own server. This is the one
//               that keeps playing with the phone locked or in another app, shows
//               lock-screen controls, and is paused by the phone during calls.
//  - "browser": the browser's built-in voice (fallback).

export type PlayState = "idle" | "loading" | "speaking" | "paused";
export type Engine = "claude" | "server" | "browser" | "none" | "loading";
export type ListenSource = "simple" | "notes" | "summary";

export interface SpeechLine {
  id: string;
  text: string;
}

export interface Queue {
  courseId: string;
  courseCode: string;
  courseTitle: string;
  source: ListenSource;
  lines: SpeechLine[];
  topicStarts: number[];
  topicTitles: string[];
}

export interface Snapshot {
  state: PlayState;
  engine: Engine;
  queue: Queue | null;
  index: number;
  rate: number;
  keepAwake: boolean;
  /** Why playback paused on its own (e.g. a call or the screen turned off). */
  note: string;
}

const SOURCE_LABEL: Record<ListenSource, string> = { simple: "Simple words", notes: "Full notes", summary: "Summary" };
export const sourceLabel = (s: ListenSource) => SOURCE_LABEL[s];

function readPref<T>(k: string, d: T): T {
  try {
    const v = localStorage.getItem(k);
    return v === null ? d : (JSON.parse(v) as T);
  } catch {
    return d;
  }
}
function writePref(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

let snap: Snapshot = {
  state: "idle",
  engine: "loading",
  queue: null,
  index: -1,
  rate: readPref("lectern.rate", 1),
  keepAwake: readPref("lectern.keepAwake", true),
  note: "",
};
const listeners = new Set<() => void>();
// ---- Saved place: where the student stopped, per course and per source ---
const posKey = (courseId: string, source: ListenSource) => `lectern.pos.${courseId}.${source}`;
export function savedPosition(courseId: string, source: ListenSource): number {
  const v = readPref<number>(posKey(courseId, source), -1);
  return typeof v === "number" ? v : -1;
}
export function forgetPosition(courseId: string, source: ListenSource) {
  try {
    localStorage.removeItem(posKey(courseId, source));
  } catch {
    /* ignore */
  }
}
let lastSaved = "";
function remember() {
  const q = snap.queue;
  if (!q || snap.index < 0) return;
  const k = `${q.courseId}.${q.source}.${snap.index}`;
  if (k === lastSaved) return;
  lastSaved = k;
  writePref(posKey(q.courseId, q.source), snap.index);
}
/** Reached the end: next time, start from the top. */
function finished() {
  if (snap.queue) forgetPosition(snap.queue.courseId, snap.queue.source);
  lastSaved = "";
  set({ state: "idle", index: -1, note: "" });
}

function set(patch: Partial<Snapshot>) {
  snap = { ...snap, ...patch };
  remember();
  listeners.forEach((l) => l());
  syncSideEffects();
}
export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export function getSnapshot() {
  return snap;
}

// ---------------------------------------------------------------- engines ---
let tts: ClaudeTts | null = null;
let ourStop = false;
let gen = 0; // bumps on every start/stop so stale browser-voice events are ignored
let nativePaused = false; // paused with our own button, so the engine can resume mid-sentence
let resumeOnVisible = false;
const BATCH = 40; // the Claude voice takes at most 100 lines per call
let fedUpTo = 0; // lines handed to the Claude voice so far

const audio = typeof Audio !== "undefined" ? new Audio() : null;
const audioCache = new Map<number, Promise<string>>();
let audioOurPause = false;

async function detectEngine(): Promise<Engine> {
  if (window.claude?.use) {
    tts = await window.claude.use("tts").catch(() => null);
    if (tts) {
      tts.onState(({ state, reason }) => onClaudeState(state, reason));
      tts.onLine(({ id }) => {
        if (id === undefined) return;
        const i = Number(id);
        set({ index: i, state: "speaking", note: "" });
        feedClaude();
      });
      return "claude";
    }
    return "speechSynthesis" in window ? "browser" : "none";
  }
  try {
    const r = await fetch("/api/tts/status");
    if (r.ok && ((await r.json()) as { enabled?: boolean }).enabled) return "server";
  } catch {
    /* no server voice */
  }
  return "speechSynthesis" in window ? "browser" : "none";
}
const ready = detectEngine().then((engine) => {
  set({ engine });
  return engine;
});

function onClaudeState(state: string, reason?: string) {
  if (state === "starting") return set({ state: "loading" });
  if (state === "speaking") return set({ state: "speaking", note: "" });
  if (state === "paused") return set({ state: "paused" });
  // idle
  nativePaused = false;
  if (ourStop || reason === "stopped" || reason === "replaced") return;
  if (reason === "completed") {
    if (snap.queue && fedUpTo < snap.queue.lines.length) return; // more lines are on the way
    return finished();
  }
  if (reason === "hidden") {
    resumeOnVisible = true;
    return set({ state: "paused", note: "Paused when you left the screen. It carries on from this line when you come back." });
  }
  if (reason === "viewer_stopped") return set({ state: "paused", note: "" });
  if (reason === "interrupted") return set({ state: "paused", note: "Paused for something else on your device. Press play to carry on." });
  if (reason === "not_granted" || reason === "unavailable") return set({ state: "idle", note: "Reading aloud is turned off for this page." });
  if (reason === "rate_limited") return set({ state: "paused", note: "Too much reading for now. Try again in a few minutes." });
  set({ state: "paused", note: "Reading stopped unexpectedly. Press play to carry on." });
}

function feedClaude() {
  const q = snap.queue;
  if (!tts || !q) return;
  if (fedUpTo < q.lines.length && snap.index >= fedUpTo - 8) {
    const next = q.lines.slice(fedUpTo, fedUpTo + BATCH);
    const start = fedUpTo;
    fedUpTo += next.length;
    tts.add(next.map((l, k) => ({ text: l.text.slice(0, 1900), id: String(start + k) }))).catch(() => {});
  }
}

function startClaude(from: number) {
  const q = snap.queue!;
  const lines = q.lines.slice(from, from + BATCH);
  fedUpTo = from + lines.length;
  ourStop = false;
  set({ state: "loading", index: from });
  tts!
    .speak(
      lines.map((l, k) => ({ text: l.text.slice(0, 1900), id: String(from + k) })),
      { rate: snap.rate },
    )
    .catch((e: { code?: string }) => {
      if (e?.code === "no_gesture") set({ state: "paused", note: "Tap play to start reading." });
    });
}

function startBrowser(from: number) {
  const q = snap.queue!;
  const my = ++gen;
  speechSynthesis.cancel();
  set({ state: "speaking", index: from, note: "" });
  q.lines.slice(from).forEach((l, k) => {
    const u = new SpeechSynthesisUtterance(l.text);
    u.rate = snap.rate;
    u.onstart = () => my === gen && set({ index: from + k, state: "speaking" });
    u.onerror = (ev) => {
      if (my !== gen || ev.error === "canceled") return;
      if (ev.error === "interrupted") {
        resumeOnVisible = document.hidden;
        set({ state: "paused", note: "Paused when you left the screen. It carries on from this line when you come back." });
      }
    };
    if (from + k === q.lines.length - 1) u.onend = () => my === gen && finished();
    speechSynthesis.speak(u);
  });
}

const ttsUrl = (text: string) => `/api/tts?t=${encodeURIComponent(text.slice(0, 1500))}`;

/** Download every line's audio so it plays without data later (kept by the offline cache). */
export async function saveOffline(q: Queue, onProgress: (done: number, total: number) => void) {
  let done = 0;
  const total = q.lines.length;
  const work = q.lines.map((l) => () => fetch(ttsUrl(l.text)).then((r) => (r.ok ? r.blob() : null)).finally(() => onProgress(++done, total)));
  const pool = Array.from({ length: 4 }, async () => {
    while (work.length) await work.shift()!().catch(() => {});
  });
  await Promise.all(pool);
}

function audioUrl(i: number): Promise<string> {
  const q = snap.queue!;
  if (!audioCache.has(i)) {
    const p = fetch(ttsUrl(q.lines[i].text)).then(async (r) => {
      if (!r.ok) throw new Error("tts failed");
      return URL.createObjectURL(await r.blob());
    });
    audioCache.set(i, p);
    p.catch(() => audioCache.delete(i));
  }
  return audioCache.get(i)!;
}

async function playAudioAt(i: number) {
  const q = snap.queue;
  if (!audio || !q) return;
  if (i >= q.lines.length) return finished();
  set({ index: i, state: snap.state === "speaking" ? "speaking" : "loading", note: "" });
  try {
    const url = await audioUrl(i);
    if (snap.queue !== q || snap.index !== i) return; // moved on meanwhile
    audio.src = url;
    audio.playbackRate = snap.rate;
    await audio.play();
    set({ state: "speaking" });
    // Fetch the next two lines while this one plays, so there is no gap.
    if (i + 1 < q.lines.length) audioUrl(i + 1).catch(() => {});
    if (i + 2 < q.lines.length) audioUrl(i + 2).catch(() => {});
  } catch {
    set({ state: "paused", note: "Couldn't load the audio. Check your connection and press play." });
  }
}

if (audio) {
  audio.preload = "auto";
  audio.addEventListener("ended", () => {
    if (snap.queue && snap.state === "speaking") playAudioAt(snap.index + 1);
  });
  // The phone pauses media for calls, alarms and other apps' sound.
  audio.addEventListener("pause", () => {
    if (audioOurPause || audio.ended) return;
    if (snap.state === "speaking") set({ state: "paused", note: "Paused by your phone (a call or another app). Press play to carry on." });
  });
  audio.addEventListener("play", () => {
    if (snap.state === "paused") set({ state: "speaking", note: "" });
  });
}

// ------------------------------------------------------------- public API ---
export async function playQueue(q: Queue, from: number) {
  await ready;
  stopEngine();
  audioCache.forEach((p) => p.then((u) => URL.revokeObjectURL(u)).catch(() => {}));
  audioCache.clear();
  set({ queue: q, index: from, note: "" });
  playFrom(from);
}

export function playFrom(i: number) {
  if (!snap.queue) return;
  resumeOnVisible = false;
  nativePaused = false;
  const from = Math.max(0, Math.min(i, snap.queue.lines.length - 1));
  if (snap.engine === "claude") startClaude(from);
  else if (snap.engine === "server") {
    stopEngine();
    set({ state: "loading" });
    playAudioAt(from);
  } else if (snap.engine === "browser") startBrowser(from);
}

export function pause() {
  if (snap.state !== "speaking" && snap.state !== "loading") return;
  resumeOnVisible = false;
  nativePaused = snap.engine === "claude" || snap.engine === "browser";
  if (snap.engine === "claude") tts?.pause();
  else if (snap.engine === "server" && audio) {
    audioOurPause = true;
    audio.pause();
    audioOurPause = false;
  } else if (snap.engine === "browser") speechSynthesis.pause();
  set({ state: "paused", note: "" });
}

export function resume() {
  if (!snap.queue) return;
  resumeOnVisible = false;
  if (snap.engine === "server" && audio && audio.src && !audio.ended) {
    audio.play().then(() => set({ state: "speaking", note: "" })).catch(() => playFrom(snap.index));
    return;
  }
  if (nativePaused && snap.engine === "browser") {
    nativePaused = false;
    speechSynthesis.resume();
    return set({ state: "speaking" });
  }
  if (nativePaused && snap.engine === "claude") {
    // A pause made with our own button can be resumed mid-sentence.
    nativePaused = false;
    tts?.resume();
    return set({ state: "speaking" });
  }
  playFrom(Math.max(0, snap.index));
}

function stopEngine() {
  ourStop = true;
  gen++;
  nativePaused = false;
  if (snap.engine === "claude") tts?.stop();
  if (snap.engine === "browser" && "speechSynthesis" in window) speechSynthesis.cancel();
  if (audio) {
    audioOurPause = true;
    audio.pause();
    audioOurPause = false;
  }
  setTimeout(() => (ourStop = false), 0);
}

export function stop() {
  resumeOnVisible = false;
  stopEngine();
  set({ state: "idle", index: -1, note: "", queue: snap.queue });
}

/** Stop and forget the queue (e.g. its course was deleted). */
export function clear() {
  stop();
  set({ queue: null });
}

export function setRate(r: number) {
  writePref("lectern.rate", r);
  set({ rate: r });
  if (snap.engine === "claude") tts?.setRate(r);
  if (audio) audio.playbackRate = r;
  if (snap.engine === "browser" && snap.state === "speaking") playFrom(snap.index);
}

export function setKeepAwake(v: boolean) {
  writePref("lectern.keepAwake", v);
  set({ keepAwake: v });
}

export function currentTopic(s: Snapshot = snap): number {
  if (!s.queue || s.index < 0) return -1;
  let t = -1;
  s.queue.topicStarts.forEach((start, k) => {
    if (start <= s.index) t = k;
  });
  return t;
}

export function skipTopic(dir: 1 | -1) {
  const q = snap.queue;
  if (!q || !q.topicStarts.length) return;
  const t = currentTopic();
  const target = Math.max(0, Math.min(q.topicStarts.length - 1, t + dir));
  playFrom(q.topicStarts[target]);
}

// ---------------------------------------------- lock screen + screen awake ---
let wakeLock: { release: () => Promise<void> } | null = null;
async function wantWake(on: boolean) {
  const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
  if (on && !wakeLock && nav.wakeLock && document.visibilityState === "visible") {
    try {
      wakeLock = await nav.wakeLock.request("screen");
      (wakeLock as unknown as EventTarget).addEventListener?.("release", () => (wakeLock = null));
    } catch {
      wakeLock = null;
    }
  } else if (!on && wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}

let lastMeta = "";
function syncSideEffects() {
  const playing = snap.state === "speaking" || snap.state === "loading";
  wantWake(playing && snap.keepAwake);

  const ms = "mediaSession" in navigator ? navigator.mediaSession : null;
  if (!ms) return;
  ms.playbackState = playing ? "playing" : snap.state === "paused" ? "paused" : "none";
  const q = snap.queue;
  const t = currentTopic();
  const title = q ? (t >= 0 ? q.topicTitles[t] : q.courseTitle) : "";
  const key = `${q?.courseId}|${q?.source}|${title}`;
  if (q && key !== lastMeta && typeof MediaMetadata !== "undefined") {
    lastMeta = key;
    ms.metadata = new MediaMetadata({ title, artist: `${q.courseCode} · ${SOURCE_LABEL[q.source]}`, album: "Lectern" });
  }
}

if ("mediaSession" in navigator) {
  const ms = navigator.mediaSession;
  const h = (a: MediaSessionAction, fn: () => void) => {
    try {
      ms.setActionHandler(a, fn);
    } catch {
      /* action not supported */
    }
  };
  h("play", resume);
  h("pause", pause);
  h("stop", stop);
  h("nexttrack", () => skipTopic(1));
  h("previoustrack", () => skipTopic(-1));
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    // Most phones silence the browser voice in the background without saying so.
    // Pause cleanly on the current line so it can carry on from there.
    if (snap.engine === "browser" && (snap.state === "speaking" || snap.state === "loading")) {
      gen++;
      speechSynthesis.cancel();
      nativePaused = false;
      resumeOnVisible = true;
      set({ state: "paused", note: "Paused when you left the screen. It carries on from this line when you come back." });
    }
    return;
  }
  if (snap.state === "speaking" && snap.keepAwake) wantWake(true);
  if (resumeOnVisible && snap.state === "paused") {
    resumeOnVisible = false;
    playFrom(Math.max(0, snap.index));
  }
});
