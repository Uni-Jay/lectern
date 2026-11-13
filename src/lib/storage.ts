import type { Course, Level, Profile, Stats } from "../types";
import type { PlanTask } from "./plan";
import { idbGet, idbSet } from "./idb";

const KEY = "lectern.v2";
const OLD_KEY = "lectern.courses.v1";

export interface Store {
  profile: Profile | null;
  courses: Course[];
  currentId: string | null;
  stats: Stats;
  /** date → ids of plan tasks ticked off that day */
  planDone: Record<string, string[]>;
  /** ids of deleted courses, so sync doesn't bring them back */
  deleted: string[];
  /** Today's plan, made once a day so it doesn't shift while you work through it. */
  plan: { date: string; tasks: PlanTask[] } | null;
  savedAt?: number;
}

export function fixProfile(p: Profile | null): Profile | null {
  if (!p) return null;
  const defaults = { language: "English", reminderTime: "", whatsapp: "" };
  return { ...defaults, ...p } as Profile;
}

const empty = (): Store => ({ profile: null, courses: [], currentId: null, stats: {}, planDone: {}, deleted: [], plan: null });

export const COURSE_COLORS = 6;

export function loadStore(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      return normalise(JSON.parse(raw) as Partial<Store>);
    }
    // Bring over courses made in the first version (skip its example course).
    const old = localStorage.getItem(OLD_KEY);
    if (old) {
      const o = JSON.parse(old) as { courses: (Course & { example?: boolean })[] };
      const courses = (o.courses ?? [])
        .filter((c) => !c.example)
        .map((c, i) => ({ ...c, color: c.color ?? i % COURSE_COLORS }));
      return { ...empty(), courses };
    }
  } catch {
    /* storage blocked: start fresh */
  }
  return empty();
}

function normalise(s: Partial<Store>): Store {
  return {
    ...empty(),
    profile: fixProfile(s.profile ?? null),
    courses: s.courses ?? [],
    stats: s.stats ?? {},
    planDone: s.planDone ?? {},
    deleted: s.deleted ?? [],
    plan: s.plan ?? null,
    savedAt: s.savedAt ?? 0,
  };
}

/** The full copy, with every file's text, from IndexedDB. */
export async function loadFromIdb(): Promise<Store | null> {
  const s = await idbGet<Partial<Store>>("kv", "state");
  return s ? normalise(s) : null;
}

/** Use whichever copy is newer; never lose a file's text that only one copy has. */
export function hydrate(local: Store, full: Store | null): Store {
  if (!full) return local;
  const base = (full.savedAt ?? 0) >= (local.savedAt ?? 0) ? full : local;
  const other = base === full ? local : full;
  const texts = new Map(other.courses.filter((c) => c.text).map((c) => [c.id, c.text]));
  return {
    ...base,
    currentId: local.currentId,
    courses: base.courses.map((c) => (c.text || !texts.has(c.id) ? c : { ...c, text: texts.get(c.id)!, textDropped: false })),
  };
}

export async function saveStore(s: Store) {
  const data = { ...s, currentId: null, savedAt: Date.now() };
  // Main copy: IndexedDB, with everything.
  const ok = await idbSet("kv", "state", data);
  if (ok) {
    // Small backup in localStorage, without the bulky file text.
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...data, courses: data.courses.map((c) => ({ ...c, text: "" })) }));
    } catch {
      /* the IndexedDB copy is enough */
    }
    return;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Over the browser's quota: keep the notes, drop the raw text of big files.
    try {
      const slim = {
        ...data,
        courses: s.courses.map((c) => (c.text.length > 50000 ? { ...c, text: "", textDropped: true } : c)),
      };
      localStorage.setItem(KEY, JSON.stringify(slim));
    } catch {
      /* nothing more we can do */
    }
  }
}

export function newCourse(code: string, title: string, level: Level, color: number): Course {
  return {
    id: Math.random().toString(36).slice(2, 10),
    code: code.trim().toUpperCase(),
    title: title.trim(),
    level,
    color,
    sources: [],
    text: "",
    topics: [],
    summary: null,
    mcq: [],
    mcqAnswers: {},
    theory: [],
    practical: [],
    updatedAt: Date.now(),
  };
}
