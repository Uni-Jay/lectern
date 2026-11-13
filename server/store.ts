// Key-value storage for accounts, sync, groups, reminders and payments.
//  - On Vercel: Upstash Redis (add it free from the Vercel Marketplace; it sets
//    KV_REST_API_URL / KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL / _TOKEN).
//  - Anywhere else: a JSON file (DATA_FILE, default data/db.json).
import fs from "node:fs";
import path from "node:path";

export interface User {
  id: string;
  email: string;
  salt: string;
  hash: string;
  plan: string;
  planUntil: number | null;
  createdAt: number;
}
export interface Group {
  code: string;
  name: string;
  createdAt: number;
  createdBy: string;
}
export interface Player {
  name: string;
  institution: string;
  week: string;
  weekPoints: number;
  totalPoints: number;
  streak: number;
  codes: string[];
}
export interface Challenge {
  id: string;
  code: string;
  title: string;
  courseCode: string;
  questions: unknown[];
  byName: string;
  createdAt: number;
  by: string;
}
export interface Reminder {
  whatsapp: string;
  time: string;
  tz: string;
  name: string;
  lastSent: string;
}

export interface KV {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
  sadd(key: string, member: string): Promise<void>;
  srem(key: string, member: string): Promise<void>;
  smembers(key: string): Promise<string[]>;
}

const REDIS_URL = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

function redis(): KV {
  const cmd = async (...args: (string | number)[]) => {
    const r = await fetch(REDIS_URL!, { method: "POST", headers: { Authorization: `Bearer ${REDIS_TOKEN}` }, body: JSON.stringify(args) });
    if (!r.ok) throw new Error(`Redis ${r.status}`);
    return ((await r.json()) as { result: unknown }).result;
  };
  return {
    async get<T>(key: string) {
      const v = (await cmd("GET", `lec:${key}`)) as string | null;
      return v ? (JSON.parse(v) as T) : null;
    },
    async set(key, value) {
      await cmd("SET", `lec:${key}`, JSON.stringify(value));
    },
    async del(key) {
      await cmd("DEL", `lec:${key}`);
    },
    async sadd(key, m) {
      await cmd("SADD", `lec:${key}`, m);
    },
    async srem(key, m) {
      await cmd("SREM", `lec:${key}`, m);
    },
    async smembers(key) {
      return ((await cmd("SMEMBERS", `lec:${key}`)) as string[]) ?? [];
    },
  };
}

function file(): KV {
  const FILE = process.env.DATA_FILE ?? (process.env.VERCEL ? "/tmp/lectern-db.json" : path.resolve("data/db.json"));
  let data: { kv: Record<string, unknown>; sets: Record<string, string[]> } = { kv: {}, sets: {} };
  try {
    data = JSON.parse(fs.readFileSync(FILE, "utf8"));
    data.kv ??= {};
    data.sets ??= {};
  } catch {
    /* new file */
  }
  let timer: NodeJS.Timeout | null = null;
  const save = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      fs.writeFileSync(FILE + ".tmp", JSON.stringify(data));
      fs.renameSync(FILE + ".tmp", FILE);
    }, 300);
  };
  return {
    async get<T>(key: string) {
      return (data.kv[key] as T) ?? null;
    },
    async set(key, value) {
      data.kv[key] = structuredClone(value);
      save();
    },
    async del(key) {
      delete data.kv[key];
      save();
    },
    async sadd(key, m) {
      const s = new Set(data.sets[key] ?? []);
      s.add(m);
      data.sets[key] = [...s];
      save();
    },
    async srem(key, m) {
      data.sets[key] = (data.sets[key] ?? []).filter((x) => x !== m);
      save();
    },
    async smembers(key) {
      return [...(data.sets[key] ?? [])];
    },
  };
}

export const persistent = !!(REDIS_URL && REDIS_TOKEN) || !process.env.VERCEL;
export const kv: KV = REDIS_URL && REDIS_TOKEN ? redis() : file();
