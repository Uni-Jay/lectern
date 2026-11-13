// Where the app is running decides how accounts, sync and study groups work.
//  - "artifact": the claude.ai test link. Sign-in is the student's Claude account;
//    data syncs and groups are shared through the artifact's own database.
//  - "server":  your own hosting (server/index.ts). Email + password accounts,
//    sync, groups, WhatsApp reminders and Paystack payments.
import type { Course, Mcq, Profile, Stats } from "../types";
import type { Store } from "./storage";

export type Mode = "artifact" | "server";
export const mode: Mode = typeof window !== "undefined" && window.claude ? "artifact" : "server";

export interface Config {
  tts: boolean;
  whatsapp: boolean;
  payments: boolean;
  accounts: boolean;
  plans: { id: string; name: string; price: number; period: string; courses: number | null }[];
  freeCourses: number;
}

const DEFAULT_PLANS: Config["plans"] = [
  { id: "free", name: "Free", price: 0, period: "", courses: 2 },
  { id: "full", name: "Full access", price: 2500, period: "one-time", courses: null },
];

export const config: Promise<Config> =
  mode === "artifact"
    ? Promise.resolve({ tts: false, whatsapp: false, payments: false, accounts: true, plans: DEFAULT_PLANS, freeCourses: 2 })
    : fetch("/api/config")
        .then((r) => (r.ok ? r.json() : null))
        .then((c: Partial<Config> | null) => ({ tts: false, whatsapp: false, payments: false, accounts: false, plans: DEFAULT_PLANS, freeCourses: 2, ...(c ?? {}) }))
        .catch(() => ({ tts: false, whatsapp: false, payments: false, accounts: false, plans: DEFAULT_PLANS, freeCourses: 2 }));

// ------------------------------------------------------------ server API ---
const TOKEN_KEY = "lectern.token";
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
function setToken(t: string | null) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  const t = getToken();
  if (t) headers.Authorization = `Bearer ${t}`;
  let body = init.body;
  if (init.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.json);
  }
  const r = await fetch(path, { ...init, headers, body });
  if (!r.ok) {
    const msg = await r.json().then((j: { error?: string }) => j.error).catch(() => "");
    throw new Error(msg || `Request failed (${r.status})`);
  }
  return r.json() as Promise<T>;
}

export interface Account {
  email: string;
  plan: string;
  planUntil: number | null;
}

export async function signUp(email: string, password: string): Promise<Account> {
  const r = await api<{ token: string; account: Account }>("/api/auth/register", { method: "POST", json: { email, password } });
  setToken(r.token);
  return r.account;
}
export async function signIn(email: string, password: string): Promise<Account> {
  const r = await api<{ token: string; account: Account }>("/api/auth/login", { method: "POST", json: { email, password } });
  setToken(r.token);
  return r.account;
}
export function signOut() {
  setToken(null);
}
export async function me(): Promise<Account | null> {
  if (!getToken()) return null;
  try {
    return await api<Account>("/api/me");
  } catch {
    return null;
  }
}

// ------------------------------------------------- Claude artifact runtime ---
type Snap = { exists: boolean; id: string; data(): Record<string, unknown> | undefined };
type QSnap = { docs: Snap[] };
interface DocRef {
  get(): Promise<Snap>;
  set(d: Record<string, unknown>): Promise<void>;
  update(d: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
  onSnapshot(next: (s: Snap) => void, err?: (e: unknown) => void): () => void;
}
interface Query {
  where(f: string, op: string, v: unknown): Query;
  orderBy(f: string, d?: "asc" | "desc"): Query;
  limit(n: number): Query;
  get(): Promise<QSnap>;
  onSnapshot(next: (s: QSnap) => void, err?: (e: unknown) => void): () => void;
}
interface Coll extends Query {
  doc(id?: string): DocRef;
}
interface Db {
  doc(p: string): DocRef;
  collection(p: string): Coll;
}
interface User {
  id(): Promise<string | null>;
}

let dbP: Promise<{ db: Db; uid: string } | null> | null = null;
function artifactDb() {
  if (!dbP) {
    dbP = (async () => {
      if (!window.claude?.use) return null;
      const [db, user] = await Promise.all([window.claude.use("db") as Promise<Db | null>, window.claude.use("user") as Promise<User | null>]);
      const uid = await user?.id().catch(() => null);
      return db && uid ? { db, uid } : null;
    })().catch(() => null);
  }
  return dbP;
}

// ------------------------------------------------------------------ sync ---
export interface Synced {
  profile: Profile | null;
  courses: Course[];
  stats: Stats;
  planDone: Record<string, string[]>;
  deleted: string[];
}

const strip = (c: Course): Course => ({ ...c, text: "", textDropped: c.text ? true : c.textDropped, chat: (c.chat ?? []).slice(-30) });

/** Newer copy of each course wins; courses deleted anywhere stay deleted. */
export function merge(local: Store, remote: Synced): Store {
  const deleted = [...new Set([...local.deleted, ...remote.deleted])];
  const byId = new Map<string, Course>();
  for (const c of remote.courses) byId.set(c.id, c);
  for (const c of local.courses) {
    const r = byId.get(c.id);
    if (!r || c.updatedAt >= r.updatedAt) byId.set(c.id, c);
    else byId.set(c.id, { ...r, text: c.text || r.text, textDropped: c.text ? false : r.textDropped });
  }
  const courses = [...byId.values()].filter((c) => !deleted.includes(c.id)).sort((a, b) => b.updatedAt - a.updatedAt);
  const lp = local.profile;
  const rp = remote.profile;
  const profile = !lp ? rp : !rp ? lp : (rp.updatedAt ?? 0) > (lp.updatedAt ?? 0) ? rp : lp;
  const stats: Stats = { ...remote.stats };
  for (const [d, per] of Object.entries(local.stats)) {
    stats[d] = { ...(stats[d] ?? {}) };
    for (const [cid, s] of Object.entries(per)) {
      const r = stats[d][cid] ?? {};
      // Keep the larger count for each figure (both copies only ever grow).
      const out: Record<string, number> = { ...(r as Record<string, number>) };
      for (const [k, v] of Object.entries(s)) out[k] = Math.max(v ?? 0, out[k] ?? 0);
      stats[d][cid] = out;
    }
  }
  const planDone: Record<string, string[]> = { ...remote.planDone };
  for (const [d, ids] of Object.entries(local.planDone)) planDone[d] = [...new Set([...(planDone[d] ?? []), ...ids])];
  return { ...local, profile, courses, stats, planDone, deleted };
}

export interface SyncStatus {
  on: boolean;
  label: string;
  at: number | null;
  error?: string;
}

const synced = new Map<string, number>(); // courseId → updatedAt last written

export async function pull(): Promise<Synced | null> {
  if (mode === "artifact") {
    const a = await artifactDb();
    if (!a) return null;
    const col = a.db.collection(`data/users/${a.uid}`);
    const snap = await col.get();
    const out: Synced = { profile: null, courses: [], stats: {}, planDone: {}, deleted: [] };
    for (const d of snap.docs) {
      const v = d.data();
      if (!v) continue;
      if (d.id === "state") {
        out.profile = (v.profile as Profile) ?? null;
        out.stats = (v.stats as Stats) ?? {};
        out.planDone = (v.planDone as Record<string, string[]>) ?? {};
        out.deleted = (v.deleted as string[]) ?? [];
      } else if (d.id.startsWith("course-")) {
        const c = v.course as Course;
        if (c) {
          out.courses.push(c);
          synced.set(c.id, c.updatedAt);
        }
      }
    }
    return out;
  }
  if (!getToken()) return null;
  const r = await api<Synced>("/api/sync");
  r.courses.forEach((c) => synced.set(c.id, c.updatedAt));
  return r;
}

export async function push(s: Store): Promise<void> {
  const state = { profile: s.profile, stats: s.stats, planDone: s.planDone, deleted: s.deleted.slice(-200) };
  if (mode === "artifact") {
    const a = await artifactDb();
    if (!a) return;
    const col = a.db.collection(`data/users/${a.uid}`);
    await col.doc("state").set({ ...state, savedAt: Date.now() });
    for (const c of s.courses) {
      if (synced.get(c.id) === c.updatedAt) continue;
      const body = strip(c);
      if (JSON.stringify(body).length > 900_000) continue; // too big for one record; stays on this device
      await col.doc(`course-${c.id}`).set({ course: body as unknown as Record<string, unknown> });
      synced.set(c.id, c.updatedAt);
    }
    for (const id of s.deleted) {
      if (synced.has(id)) {
        await col.doc(`course-${id}`).delete().catch(() => {});
        synced.delete(id);
      }
    }
    return;
  }
  if (!getToken()) return;
  await api("/api/sync", { method: "PUT", json: { ...state, courses: s.courses.map(strip) } });
  s.courses.forEach((c) => synced.set(c.id, c.updatedAt));
}

export async function syncAvailable(): Promise<boolean> {
  if (mode === "artifact") return !!(await artifactDb());
  return !!getToken();
}

// --------------------------------------------------------- study groups ---
export interface GroupMeta {
  code: string;
  name: string;
  createdAt: number;
}
export interface Member {
  id: string;
  name: string;
  institution: string;
  weekPoints: number;
  totalPoints: number;
  streak: number;
  isMe: boolean;
}
export interface Challenge {
  id: string;
  code: string;
  title: string;
  courseCode: string;
  questions: Mcq[];
  byName: string;
  createdAt: number;
}
export interface Score {
  id: string;
  name: string;
  score: number;
  total: number;
  at: number;
  isMe: boolean;
}
export interface MyPoints {
  name: string;
  institution: string;
  week: string;
  weekPoints: number;
  totalPoints: number;
  streak: number;
}

export const isoWeek = (d = new Date()) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${String(w).padStart(2, "0")}`;
};

const newCode = () => Array.from({ length: 6 }, () => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 31)]).join("");

export interface GroupsApi {
  available(): Promise<boolean>;
  create(name: string): Promise<GroupMeta>;
  join(code: string): Promise<GroupMeta | null>;
  leave(code: string): Promise<void>;
  myCodes(): Promise<string[]>;
  meta(code: string): Promise<GroupMeta | null>;
  watchMembers(code: string, fn: (m: Member[]) => void): () => void;
  watchChallenges(code: string, fn: (c: Challenge[]) => void): () => void;
  watchScores(challengeId: string, fn: (s: Score[]) => void): () => void;
  postChallenge(c: Omit<Challenge, "id" | "createdAt">): Promise<void>;
  submitScore(challengeId: string, name: string, score: number, total: number): Promise<void>;
  publishPoints(p: MyPoints): Promise<void>;
}

function artifactGroups(): GroupsApi {
  const me = async () => {
    const a = await artifactDb();
    if (!a) throw new Error("Sign in to Claude to use groups.");
    return a;
  };
  const player = async () => {
    const a = await me();
    const ref = a.db.doc(`players/${a.uid}`);
    const s = await ref.get();
    return { a, ref, data: (s.exists ? s.data() : {}) as Record<string, unknown> };
  };
  return {
    available: async () => !!(await artifactDb()),
    async create(name) {
      const a = await me();
      const code = newCode();
      const meta = { code, name: name.trim(), createdAt: Date.now() };
      await a.db.doc(`groups/${code}`).set(meta);
      await this.join(code);
      return meta;
    },
    async join(code) {
      const a = await me();
      const c = code.trim().toUpperCase();
      const g = await a.db.doc(`groups/${c}`).get();
      if (!g.exists) return null;
      const { ref, data } = await player();
      const codes = new Set((data.codes as string[]) ?? []);
      codes.add(c);
      await ref.set({ ...data, codes: [...codes] });
      return g.data() as unknown as GroupMeta;
    },
    async leave(code) {
      const { ref, data } = await player();
      await ref.set({ ...data, codes: ((data.codes as string[]) ?? []).filter((x) => x !== code) });
    },
    async myCodes() {
      const { data } = await player().catch(() => ({ data: {} as Record<string, unknown> }));
      return (data.codes as string[]) ?? [];
    },
    async meta(code) {
      const a = await me();
      const g = await a.db.doc(`groups/${code}`).get();
      return g.exists ? (g.data() as unknown as GroupMeta) : null;
    },
    watchMembers(code, fn) {
      let off = () => {};
      me().then((a) => {
        off = a.db
          .collection("players")
          .where("codes", "array-contains", code)
          .onSnapshot((s) => {
            const wk = isoWeek();
            fn(
              s.docs.map((d) => {
                const v = d.data() ?? {};
                return {
                  id: d.id,
                  name: String(v.name ?? "Student"),
                  institution: String(v.institution ?? ""),
                  weekPoints: v.week === wk ? Number(v.weekPoints ?? 0) : 0,
                  totalPoints: Number(v.totalPoints ?? 0),
                  streak: Number(v.streak ?? 0),
                  isMe: d.id === a.uid,
                };
              }),
            );
          });
      });
      return () => off();
    },
    watchChallenges(code, fn) {
      let off = () => {};
      me().then((a) => {
        off = a.db
          .collection("challenges")
          .where("code", "==", code)
          .onSnapshot((s) => fn(s.docs.map((d) => ({ ...(d.data() as unknown as Challenge), id: d.id })).sort((x, y) => y.createdAt - x.createdAt)));
      });
      return () => off();
    },
    watchScores(cid, fn) {
      let off = () => {};
      me().then((a) => {
        off = a.db
          .collection("scores")
          .where("challenges", "array-contains", cid)
          .onSnapshot((s) =>
            fn(
              s.docs
                .map((d) => {
                  const v = d.data() ?? {};
                  const r = ((v.results as Record<string, { score: number; total: number; at: number }>) ?? {})[cid];
                  return r ? { id: d.id, name: String(v.name ?? "Student"), ...r, isMe: d.id === a.uid } : null;
                })
                .filter((x): x is Score => !!x)
                .sort((x, y) => y.score / y.total - x.score / x.total || x.at - y.at),
            ),
          );
      });
      return () => off();
    },
    async postChallenge(c) {
      const a = await me();
      await a.db.collection("challenges").doc().set({ ...c, createdAt: Date.now() } as unknown as Record<string, unknown>);
    },
    async submitScore(cid, name, score, total) {
      const a = await me();
      const ref = a.db.doc(`scores/${a.uid}`);
      const s = await ref.get();
      const v = (s.exists ? s.data() : {}) as Record<string, unknown>;
      const results = { ...((v.results as Record<string, unknown>) ?? {}), [cid]: { score, total, at: Date.now() } };
      await ref.set({ name, results, challenges: Object.keys(results) });
    },
    async publishPoints(p) {
      const { ref, data } = await player();
      await ref.set({ ...data, ...p, codes: (data.codes as string[]) ?? [] });
    },
  };
}

function serverGroups(): GroupsApi {
  const poll = <T,>(path: string, fn: (v: T) => void) => {
    let live = true;
    const tick = () =>
      api<T>(path)
        .then((v) => live && fn(v))
        .catch(() => {})
        .finally(() => live && setTimeout(tick, 15000));
    tick();
    return () => {
      live = false;
    };
  };
  return {
    available: async () => !!getToken(),
    create: (name) => api<GroupMeta>("/api/groups", { method: "POST", json: { name } }),
    join: (code) => api<GroupMeta>(`/api/groups/${encodeURIComponent(code.trim().toUpperCase())}/join`, { method: "POST" }).catch(() => null),
    leave: (code) => api(`/api/groups/${code}/leave`, { method: "POST" }).then(() => {}),
    myCodes: () => api<string[]>("/api/groups/mine").catch(() => []),
    meta: (code) => api<GroupMeta>(`/api/groups/${code}`).catch(() => null),
    watchMembers: (code, fn) =>
      poll<(Member & { week?: string })[]>(`/api/groups/${code}/members`, (m) => fn(m.map((x) => ({ ...x, weekPoints: x.week === isoWeek() ? x.weekPoints : 0 })))),
    watchChallenges: (code, fn) => poll(`/api/groups/${code}/challenges`, fn),
    watchScores: (cid, fn) => poll(`/api/challenges/${cid}/scores`, fn),
    postChallenge: (c) => api(`/api/groups/${c.code}/challenges`, { method: "POST", json: c }).then(() => {}),
    submitScore: (cid, name, score, total) => api(`/api/challenges/${cid}/scores`, { method: "POST", json: { name, score, total } }).then(() => {}),
    publishPoints: (p) => api("/api/me/points", { method: "PUT", json: p }).then(() => {}),
  };
}

export const groups: GroupsApi = mode === "artifact" ? artifactGroups() : serverGroups();

// --------------------------------------------------------- reminders & pay ---
export async function saveWhatsAppReminder(number: string, time: string, name: string) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return api("/api/reminders", { method: "PUT", json: { whatsapp: number, time, tz, name } });
}

export async function startPayment(plan: string): Promise<string> {
  const r = await api<{ url: string }>("/api/pay/init", { method: "POST", json: { plan, callback: location.origin + "/?paid=1" } });
  return r.url;
}
