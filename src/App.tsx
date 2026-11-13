import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Card, ChatMsg, Course, DayStat, Level, Mcq, MockResult, PastQuestion, PracticalTask, Profile, Simple, Summary, TabId, TheoryQ, Topic } from "./types";
import { levelLabel } from "./types";
import { COURSE_COLORS, fixProfile, hydrate, loadFromIdb, loadStore, newCourse, saveStore, type Store } from "./lib/storage";
import { idbDel, idbGet, idbSet } from "./lib/idb";
import { chunkText } from "./lib/files";
import { askJson, askText, friendlyError, imageLimit } from "./lib/ai";
import {
  OCR_PROMPT,
  askPrompt,
  flashcardPrompt,
  gradePrompt,
  mcqPrompt,
  mockPrompt,
  notesPrompt,
  pastPaperPrompt,
  practicalPrompt,
  simplePrompt,
  summaryPrompt,
  theoryPrompt,
} from "./lib/prompts";
import { Header, type View } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { NotesView } from "./components/NotesView";
import { SummaryView } from "./components/SummaryView";
import { ListenView, type ListenSource } from "./components/ListenView";
import { McqView } from "./components/McqView";
import { TheoryView } from "./components/TheoryView";
import { PracticalView } from "./components/PracticalView";
import { NewCourseForm } from "./components/NewCourseForm";
import { Onboarding } from "./components/Onboarding";
import { Home } from "./components/Home";
import { MiniPlayer } from "./components/MiniPlayer";
import { FlashcardsView } from "./components/FlashcardsView";
import { AskView } from "./components/AskView";
import { MockView, type MockSession } from "./components/MockView";
import { PastView } from "./components/PastView";
import { ProgressView } from "./components/ProgressView";
import { GroupsView } from "./components/GroupsView";
import { MeView } from "./components/MeView";
import * as player from "./lib/player";
import { dayKey, daysUntil } from "./lib/dates";
import { bump, dayTotal, minutesOf, streak as calcStreak } from "./lib/report";
import { isDone, makePlan, type PlanTask } from "./lib/plan";
import { cardsFromNotes, mergeCards, newCard, review, type Grade } from "./lib/srs";
import { reminderIcs } from "./lib/ics";
import { saveText } from "./lib/exporting";
import { config, groups, isoWeek, me, merge, mode, pull, push, syncAvailable, type SyncStatus } from "./lib/platform";

export interface Job {
  label: string;
  done: number;
  total: number;
  error?: string;
}

const TABS: { id: TabId; label: string }[] = [
  { id: "notes", label: "Notes" },
  { id: "summary", label: "Summary" },
  { id: "listen", label: "Listen" },
  { id: "cards", label: "Flashcards" },
  { id: "ask", label: "Ask my notes" },
  { id: "mcq", label: "MCQ" },
  { id: "theory", label: "Theory" },
  { id: "practical", label: "Practical" },
  { id: "mock", label: "Mock exam" },
  { id: "past", label: "Past questions" },
];

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

function cleanSimple(s: Partial<Simple> | undefined): Simple | undefined {
  if (!s || !s.explanation) return undefined;
  return { explanation: String(s.explanation), example: String(s.example ?? ""), remember: String(s.remember ?? "") };
}

function cleanTopic(t: Partial<Topic>): Topic {
  return {
    title: String(t.title ?? "Untitled topic"),
    pages: String(t.pages ?? ""),
    keyPoints: arr<string>(t.keyPoints).map(String),
    definitions: arr<{ term: string; meaning: string }>(t.definitions).filter((d) => d && d.term),
    formulasExamples: arr<string>(t.formulasExamples).map(String),
    examTips: arr<string>(t.examTips).map(String),
    simple: cleanSimple(t.simple),
  };
}

const cleanMcq = (qs: unknown) => arr<Mcq>(qs).filter((q) => q && q.q && Array.isArray(q.options) && q.options.length >= 2 && typeof q.answer === "number");

function mergeTopics(into: Topic[], add: Topic[]): Topic[] {
  const out = [...into];
  for (const t of add) {
    const last = out[out.length - 1];
    if (last && last.title.trim().toLowerCase() === t.title.trim().toLowerCase()) {
      out[out.length - 1] = {
        ...last,
        pages: last.pages && t.pages && last.pages !== t.pages ? `${last.pages}, ${t.pages}` : last.pages || t.pages,
        keyPoints: [...last.keyPoints, ...t.keyPoints],
        definitions: [...last.definitions, ...t.definitions],
        formulasExamples: [...last.formulasExamples, ...t.formulasExamples],
        examTips: [...last.examTips, ...t.examTips],
        simple:
          last.simple && t.simple
            ? { explanation: `${last.simple.explanation}\n\n${t.simple.explanation}`, example: last.simple.example || t.simple.example, remember: last.simple.remember || t.simple.remember }
            : last.simple ?? t.simple,
      };
    } else out.push(t);
  }
  return out;
}

const uid = () => Math.random().toString(36).slice(2, 10);

export default function App() {
  const [store, setStore] = useState<Store>(loadStore);
  const [view, setView] = useState<View>("home");
  const [tab, setTab] = useState<TabId>("notes");
  const [creating, setCreating] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [explaining, setExplaining] = useState<number | null>(null);
  const [listenFrom, setListenFrom] = useState<{ source: ListenSource; topic?: number } | null>(null);
  const [mocks, setMocks] = useState<Record<string, MockSession | null>>({});
  const [sync, setSync] = useState<SyncStatus>({ on: false, label: "", at: null });
  const [reminderMsg, setReminderMsg] = useState("");
  const [needAccount, setNeedAccount] = useState(false);
  const [plan, setPlanInfo] = useState<{ payments: boolean; free: number; mine: string }>({ payments: false, free: 2, mine: "free" });
  const abortRef = useRef<AbortController | null>(null);
  const pendingImages = useRef<Map<string, Blob[]>>(new Map());
  const [, force] = useState(0);
  const storeRef = useRef(store);
  storeRef.current = store;

  const { profile } = store;
  const course = view === "course" ? store.courses.find((c) => c.id === store.currentId) ?? null : null;

  // ---- Loading and saving ---------------------------------------------------
  // The full copy lives in IndexedDB. Load it before saving anything, so a
  // half-loaded state can never overwrite it.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    (async () => {
      const full = await loadFromIdb();
      const merged = hydrate(storeRef.current, full);
      setStore(merged);
      for (const c of merged.courses) {
        const imgs = await idbGet<Blob[]>("images", c.id);
        if (imgs?.length) pendingImages.current.set(c.id, imgs);
      }
      const saved = await idbGet<Record<string, MockSession | null>>("kv", "mocks");
      if (saved) {
        const now = Date.now();
        // Time with the app closed doesn't count against the exam clock.
        const restored = Object.fromEntries(
          Object.entries(saved).map(([k, s]) => [k, s ? { ...s, resumedAt: now, phase: s.phase === "marking" ? ("running" as const) : s.phase } : null]),
        );
        setMocks(restored);
      }
      setHydrated(true);
    })();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(() => saveStore(store), 300);
    return () => clearTimeout(t);
  }, [store, hydrated]);

  // Unfinished mock exams: saved on every answer, every 10 seconds, and when the app is hidden.
  const mocksRef = useRef(mocks);
  mocksRef.current = mocks;
  useEffect(() => {
    if (!hydrated) return;
    const persist = () => {
      const now = Date.now();
      const snap = Object.fromEntries(
        Object.entries(mocksRef.current).map(([k, s]) =>
          [k, s && s.phase === "running" ? { ...s, usedMs: (s.usedMs ?? 0) + (now - (s.resumedAt ?? now)), resumedAt: now } : s],
        ),
      );
      idbSet("kv", "mocks", snap);
    };
    persist();
    const t = setInterval(persist, 10000);
    const onHide = () => document.visibilityState === "hidden" && persist();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", persist);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", persist);
    };
  }, [mocks, hydrated]);

  const setImages = (id: string, list: Blob[] | null) => {
    if (list && list.length) {
      pendingImages.current.set(id, list);
      idbSet("images", id, list);
    } else {
      pendingImages.current.delete(id);
      idbDel("images", id);
    }
  };

  const syncNow = useCallback(async (pullFirst = false) => {
    if (!(await syncAvailable())) return setSync({ on: false, label: "", at: null });
    try {
      if (pullFirst) {
        const remote = await pull();
        if (remote) setStore((s) => merge(s, remote));
      }
      await new Promise((r) => setTimeout(r, 50));
      await push(storeRef.current);
      setSync({ on: true, label: "Synced", at: Date.now() });
    } catch (e) {
      setSync({ on: true, label: "", at: null, error: (e as Error).message ? "Couldn't sync. Will try again." : "Couldn't sync." });
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    syncNow(true);
  }, [hydrated, syncNow]);

  useEffect(() => {
    config.then((c) => setPlanInfo((p) => ({ ...p, payments: c.payments, free: c.freeCourses })));
    if (mode === "server") me().then((a) => a && setPlanInfo((p) => ({ ...p, mine: a.plan })));
  }, []);

  useEffect(() => {
    if (!sync.on) return;
    const t = setTimeout(() => syncNow(false), 4000);
    return () => clearTimeout(t);
  }, [store.courses, store.profile, store.stats, store.planDone, store.deleted, sync.on, syncNow]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [store.currentId, view]);

  const update = useCallback((id: string, fn: (c: Course) => Course) => {
    setStore((s) => ({ ...s, courses: s.courses.map((c) => (c.id === id ? { ...fn(c), updatedAt: Date.now() } : c)) }));
  }, []);

  const log = useCallback((courseId: string, patch: Partial<DayStat>) => {
    setStore((s) => ({ ...s, stats: bump(s.stats, courseId, patch) }));
  }, []);

  const markStudied = useCallback(
    (courseId: string, topic: number, on = true) =>
      update(courseId, (c) => {
        const set = new Set(c.studied ?? []);
        if (on) set.add(topic);
        else set.delete(topic);
        return { ...c, studied: [...set].sort((a, b) => a - b) };
      }),
    [update],
  );

  // ---- Listening counts as study time; finishing a topic marks it studied ---
  useEffect(() => {
    let last = player.getSnapshot();
    return player.subscribe(() => {
      const s = player.getSnapshot();
      if (s.queue && last.queue === s.queue && s.index !== last.index && last.index >= 0 && last.state === "speaking") {
        const words = s.queue.lines[last.index]?.text.split(/\s+/).length ?? 0;
        log(s.queue.courseId, { listenSec: Math.round((words / 2.6) * (1 / s.rate)) });
        const was = player.currentTopic(last);
        const now = player.currentTopic(s);
        if (was >= 0 && now !== was && s.queue.source !== "summary") {
          const exists = storeRef.current.courses.find((c) => c.id === s.queue!.courseId);
          if (exists && !exists.studied?.includes(was)) {
            markStudied(s.queue.courseId, was);
            log(s.queue.courseId, { topics: 1 });
          }
        }
      }
      if (last.state === "speaking" && s.state === "idle" && last.queue && last.queue.source !== "summary") {
        const t = player.currentTopic(last);
        if (t >= 0) markStudied(last.queue.courseId, t);
      }
      last = s;
    });
  }, [log, markStudied]);

  // ---- Today's plan ---------------------------------------------------------
  const today = dayKey();
  useEffect(() => {
    if (!profile) return;
    if (!store.plan || store.plan.date !== today) setStore((s) => ({ ...s, plan: { date: today, tasks: makePlan(profile, s.courses) } }));
  }, [profile, store.plan, today]);
  const tasks = store.plan?.date === today ? store.plan.tasks.filter((t) => store.courses.some((c) => c.id === t.courseId)) : [];
  const ticked = store.planDone[today] ?? [];
  const doneFn = (t: PlanTask) => isDone(t, ticked, store.stats, store.courses);
  const streakN = useMemo(() => calcStreak(store.stats, store.planDone), [store.stats, store.planDone]);
  const todayMin = minutesOf(dayTotal(store.stats, today));

  // ---- Weekly points for study groups ---------------------------------------
  useEffect(() => {
    if (!profile) return;
    const t = setTimeout(async () => {
      if (!(await groups.available())) return;
      const wk = isoWeek();
      let week = 0;
      let total = 0;
      for (const [d, per] of Object.entries(store.stats)) {
        const s = Object.values(per).reduce(
          (n, x) => n + (x.mcqRight ?? 0) * 2 + (x.cards ?? 0) + Math.round((x.listenSec ?? 0) / 60) + (x.mocks ?? 0) * 20,
          0,
        );
        total += s;
        if (isoWeek(new Date(d + "T12:00")) === wk) week += s;
      }
      groups.publishPoints({ name: profile.preferredName, institution: profile.institution, week: wk, weekPoints: week, totalPoints: total, streak: streakN }).catch(() => {});
    }, 5000);
    return () => clearTimeout(t);
  }, [store.stats, profile, streakN]);

  const busy = !!job && !job.error && job.done < job.total;

  // ---- Profile -----------------------------------------------------------------
  if (!profile || editingProfile) {
    return (
      <Onboarding
        initial={profile}
        onCancel={() => setEditingProfile(false)}
        onSave={(p: Profile) => {
          setStore((s) => ({ ...s, profile: fixProfile({ ...p, updatedAt: Date.now() }), plan: null }));
          setEditingProfile(false);
        }}
      />
    );
  }

  // ---- Files ---------------------------------------------------------------
  async function addFiles(c: Course, files: File[]): Promise<string> {
    let text = c.text;
    if (!files.length) return text;
    const id = c.id;
    const usable = files.filter((f) => !f.name.startsWith(".") && f.size > 0);
    setJob({ label: "Opening your files", done: 0, total: usable.length });
    const { extractFile } = await import("./lib/extract");
    for (const [i, f] of usable.entries()) {
      setJob({ label: `Opening ${f.name}`, done: i, total: usable.length });
      try {
        const r = await extractFile(f);
        if (r.images.length) setImages(id, [...(pendingImages.current.get(id) ?? []), ...r.images]);
        if (r.text) text = `${text}\n\n[File: ${f.name}]\n${r.text}`.trim();
        update(id, (x) => ({
          ...x,
          sources: [...x.sources.filter((s) => s.name !== r.source.name), r.source],
          text: r.text ? `${x.text}\n\n[File: ${f.name}]\n${r.text}`.trim() : x.text,
        }));
      } catch {
        update(id, (x) => ({ ...x, sources: [...x.sources, { name: f.name, kind: "File", pages: 0, chars: 0, note: "Couldn't open this file" }] }));
      }
    }
    setJob(null);
    force((n) => n + 1);
    return text;
  }

  function clearFiles(c: Course) {
    setImages(c.id, null);
    update(c.id, (x) => ({ ...x, sources: [], text: "", textDropped: false, reading: undefined }));
  }

  async function readImages(imgs: Blob[], signal: AbortSignal, label: string) {
    const per = Math.max(1, Math.min(5, await imageLimit()));
    const batches = Math.ceil(imgs.length / per);
    let text = "";
    for (let b = 0; b < batches; b++) {
      setJob({ label: `${label} (${b + 1} of ${batches})`, done: b, total: batches });
      text += "\n\n" + (await askText(OCR_PROMPT, { images: imgs.slice(b * per, (b + 1) * per), signal }));
    }
    return text.trim();
  }

  // ---- Reading: photos → notes (with simple explanations) → summary --------
  /** Reads the course text part by part. With `resume`, carries on from the last finished part. */
  async function readNotes(start: Course, resume = false) {
    const id = start.id;
    const ctl = new AbortController();
    abortRef.current = ctl;
    let c = start;
    try {
      const imgs = pendingImages.current.get(id) ?? [];
      if (imgs.length) {
        const text = await readImages(imgs, ctl.signal, "Reading your photos and scanned pages");
        c = { ...c, text: `${c.text}\n\n[File: photos and scanned pages]\n${text}`.trim() };
        update(id, (x) => ({ ...x, text: c.text }));
        setImages(id, null);
      }

      const chunks = chunkText(c.text);
      const canResume = resume && c.reading && c.reading.textLen === c.text.length && c.reading.total === chunks.length;
      const from = canResume ? c.reading!.done : 0;
      let topics: Topic[] = canResume ? c.topics : [];
      if (!canResume) update(id, (x) => ({ ...x, topics: [], studied: [] }));
      update(id, (x) => ({ ...x, reading: { done: from, total: chunks.length, textLen: c.text.length } }));
      setTab("notes");
      for (let i = from; i < chunks.length; i++) {
        setJob({ label: `Reading every page and explaining it: part ${i + 1} of ${chunks.length}`, done: i, total: chunks.length + 1 });
        const prompt = notesPrompt(profile, c, chunks[i], i + 1, chunks.length);
        let res: { topics: Partial<Topic>[] };
        try {
          res = await askJson(prompt, { signal: ctl.signal });
        } catch (e) {
          if ((e as { code?: string }).code !== "invalid_json") throw e;
          res = await askJson(prompt + "\n\nReturn valid JSON only.", { signal: ctl.signal });
        }
        topics = mergeTopics(topics, arr<Partial<Topic>>(res.topics).map(cleanTopic));
        const snapshot = topics;
        update(id, (x) => ({ ...x, topics: snapshot, reading: { done: i + 1, total: chunks.length, textLen: c.text.length } }));
      }
      // Every key term becomes a flashcard straight away.
      update(id, (x) => ({ ...x, cards: mergeCards(x.cards ?? [], cardsFromNotes({ ...x, topics })) }));

      setJob({ label: "Writing your summary", done: chunks.length, total: chunks.length + 1 });
      const summary = await askJson<Summary>(summaryPrompt(profile, { ...c, topics }), { signal: ctl.signal });
      update(id, (x) => ({ ...x, reading: undefined, summary: { overview: arr(summary.overview), mustKnow: arr(summary.mustKnow), quickRevision: arr(summary.quickRevision) } }));
      setJob(null);
      setStore((s) => ({ ...s, plan: null }));
    } catch (e) {
      setJob((j) => ({ label: j?.label ?? "", done: 0, total: 1, error: friendlyError(e) }));
    } finally {
      abortRef.current = null;
    }
  }

  async function explainTopic(c: Course, i: number, language?: string) {
    setExplaining(i);
    try {
      const s = await askJson<Simple>(simplePrompt(profile, c, c.topics[i], language));
      const clean = cleanSimple(s);
      if (clean) update(c.id, (x) => ({ ...x, topics: x.topics.map((t, k) => (k === i ? { ...t, simple: clean } : t)) }));
    } catch (e) {
      setJob({ label: "Explaining in simple words", done: 0, total: 1, error: friendlyError(e) });
    } finally {
      setExplaining(null);
    }
  }

  async function makeSummary(c: Course) {
    const ctl = new AbortController();
    abortRef.current = ctl;
    setJob({ label: "Writing your summary", done: 0, total: 1 });
    try {
      const s = await askJson<Summary>(summaryPrompt(profile, c), { signal: ctl.signal });
      update(c.id, (x) => ({ ...x, summary: { overview: arr(s.overview), mustKnow: arr(s.mustKnow), quickRevision: arr(s.quickRevision) } }));
      setJob(null);
    } catch (e) {
      setJob({ label: "Writing your summary", done: 0, total: 1, error: friendlyError(e) });
    }
  }

  // ---- Questions -----------------------------------------------------------
  async function generate(c: Course, kind: "mcq" | "theory" | "practical", count: number) {
    const ctl = new AbortController();
    abortRef.current = ctl;
    const label = { mcq: "Setting MCQs", theory: "Setting theory questions", practical: "Setting practical tasks" }[kind];
    setJob({ label: `${label} for ${levelLabel(c.level)}`, done: 0, total: 1 });
    try {
      if (kind === "mcq") {
        const r = await askJson<{ questions: Mcq[] }>(mcqPrompt(profile, c, count), { signal: ctl.signal });
        update(c.id, (x) => ({ ...x, mcq: cleanMcq(r.questions), mcqAnswers: {} }));
      } else if (kind === "theory") {
        const r = await askJson<{ questions: TheoryQ[] }>(theoryPrompt(profile, c, count), { signal: ctl.signal });
        update(c.id, (x) => ({ ...x, theory: arr<TheoryQ>(r.questions).filter((q) => q.q) }));
      } else {
        const r = await askJson<{ tasks: PracticalTask[] }>(practicalPrompt(profile, c, count), { signal: ctl.signal });
        update(c.id, (x) => ({ ...x, practical: arr<PracticalTask>(r.tasks).filter((t) => t.title) }));
      }
      setJob(null);
    } catch (e) {
      setJob({ label, done: 0, total: 1, error: friendlyError(e) });
    }
  }

  // ---- Flashcards ------------------------------------------------------------
  async function moreCards(c: Course, n: number) {
    setJob({ label: "Making flashcards", done: 0, total: 1 });
    try {
      const r = await askJson<{ cards: { front: string; back: string; topic: string }[] }>(flashcardPrompt(profile, c, n));
      const made = arr<{ front: string; back: string; topic: string }>(r.cards).filter((k) => k.front && k.back).map((k) => newCard(k.front, k.back, k.topic ?? ""));
      update(c.id, (x) => ({ ...x, cards: mergeCards(x.cards ?? [], made) }));
      setJob(null);
    } catch (e) {
      setJob({ label: "Making flashcards", done: 0, total: 1, error: friendlyError(e) });
    }
  }

  function gradeCard(c: Course, card: Card, g: Grade) {
    update(c.id, (x) => ({ ...x, cards: (x.cards ?? []).map((k) => (k.id === card.id ? review(k, g) : k)) }));
    log(c.id, { cards: 1, cardsRight: g === "again" ? 0 : 1 });
  }

  // ---- Ask my notes -----------------------------------------------------------
  async function ask(c: Course, q: string) {
    const msg: ChatMsg = { role: "user", text: q, at: Date.now() };
    const history = c.chat ?? [];
    update(c.id, (x) => ({ ...x, chat: [...(x.chat ?? []), msg] }));
    log(c.id, { asks: 1 });
    try {
      const text = await askText(askPrompt(profile, c, history, q));
      update(c.id, (x) => ({ ...x, chat: [...(x.chat ?? []), { role: "assistant", text: text.trim(), at: Date.now() }] }));
    } catch (e) {
      update(c.id, (x) => ({ ...x, chat: [...(x.chat ?? []), { role: "assistant", text: friendlyError(e), at: Date.now() }] }));
    }
  }

  // ---- Mock exams -------------------------------------------------------------
  async function startMock(c: Course, minutes: number, mcqs: number, theories: number) {
    setJob({ label: "Setting your mock exam paper", done: 0, total: 1 });
    try {
      const r = await askJson<{ mcq: Mcq[]; theory: TheoryQ[] }>(mockPrompt(profile, c, mcqs, theories));
      const paper = { mcq: cleanMcq(r.mcq), theory: arr<TheoryQ>(r.theory).filter((q) => q.q) };
      if (!paper.mcq.length && !paper.theory.length) throw new Error("empty");
      setMocks((m) => ({ ...m, [c.id]: { paper, minutes, startedAt: Date.now(), usedMs: 0, resumedAt: Date.now(), answers: {}, written: {}, phase: "running" } }));
      setJob(null);
    } catch (e) {
      setJob({ label: "Setting your mock exam paper", done: 0, total: 1, error: friendlyError(e) });
    }
  }

  async function submitMock(c: Course, s: MockSession) {
    if (s.phase !== "running") return;
    setMocks((m) => ({ ...m, [c.id]: { ...s, phase: "marking" } }));
    const mcqRight = s.paper.mcq.filter((q, i) => s.answers[i] === q.answer).length;
    let graded: { score: number; feedback: string; missing: string[] }[] = [];
    if (s.paper.theory.length) {
      try {
        const r = await askJson<{ results: { score: number; feedback: string; missing: string[] }[] }>(
          gradePrompt(profile, c, s.paper.theory.map((q, i) => ({ ...q, answer: s.written[i] ?? "" }))),
        );
        graded = s.paper.theory.map((q, i) => {
          const g = arr<{ score: number; feedback: string; missing: string[] }>(r.results)[i];
          return { score: Math.max(0, Math.min(q.marks, Number(g?.score) || 0)), feedback: String(g?.feedback ?? ""), missing: arr<string>(g?.missing) };
        });
      } catch {
        graded = s.paper.theory.map(() => ({ score: 0, feedback: "Couldn't mark this answer automatically. Compare it with the model answer.", missing: [] }));
      }
    }
    const theoryScore = graded.reduce((n, g) => n + g.score, 0);
    const theoryTotal = s.paper.theory.reduce((n, q) => n + q.marks, 0);
    // MCQs and theory weigh equally when both are present, like most papers.
    const mcqPct = s.paper.mcq.length ? mcqRight / s.paper.mcq.length : null;
    const thPct = theoryTotal ? theoryScore / theoryTotal : null;
    const percent = Math.round(((mcqPct ?? thPct ?? 0) + (thPct ?? mcqPct ?? 0)) * 50);
    const weak = new Map<string, number>();
    s.paper.mcq.forEach((q, i) => s.answers[i] !== q.answer && weak.set(q.topic, (weak.get(q.topic) ?? 0) + 1));
    s.paper.theory.forEach((q, i) => graded[i] && graded[i].score < q.marks / 2 && weak.set(q.topic, (weak.get(q.topic) ?? 0) + 2));
    const result: MockResult = {
      id: uid(),
      at: Date.now(),
      minutes: s.minutes,
      mcqRight,
      mcqTotal: s.paper.mcq.length,
      theoryScore,
      theoryTotal,
      percent,
      weakTopics: [...weak.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t).filter(Boolean).slice(0, 4),
    };
    setMocks((m) => ({ ...m, [c.id]: { ...s, phase: "done", graded, result } }));
    update(c.id, (x) => ({ ...x, mocks: [...(x.mocks ?? []), result] }));
    log(c.id, { mocks: 1, mockPct: percent, mcqAns: s.paper.mcq.length, mcqRight });
  }

  // ---- Past questions ------------------------------------------------------------
  async function addPastPapers(c: Course, files: File[]) {
    const { extractFile } = await import("./lib/extract");
    const ctl = new AbortController();
    abortRef.current = ctl;
    try {
      for (const [i, f] of files.entries()) {
        setJob({ label: `Reading past paper: ${f.name}`, done: i, total: files.length });
        const r = await extractFile(f);
        let text = r.text;
        if (r.images.length) text += "\n\n" + (await readImages(r.images, ctl.signal, `Reading ${f.name}`));
        if (!text.trim()) continue;
        setJob({ label: `Pulling questions out of ${f.name}`, done: i, total: files.length });
        const res = await askJson<{ questions: PastQuestion[] }>(pastPaperPrompt(c, f.name, text), { signal: ctl.signal });
        const qs = arr<PastQuestion>(res.questions)
          .filter((q) => q.q)
          .map((q) => ({ q: String(q.q), type: (["mcq", "theory", "practical"].includes(q.type) ? q.type : "theory") as PastQuestion["type"], marks: Number(q.marks) || 0, year: String(q.year ?? ""), topic: String(q.topic ?? "Other"), paper: f.name }));
        update(c.id, (x) => ({ ...x, pastQuestions: [...(x.pastQuestions ?? []), ...qs], pastPapers: [...new Set([...(x.pastPapers ?? []), f.name])] }));
      }
      setJob(null);
    } catch (e) {
      setJob({ label: "Reading past papers", done: 0, total: 1, error: friendlyError(e) });
    }
  }

  function stop() {
    abortRef.current?.abort();
    setJob(null);
  }

  // ---- Courses -------------------------------------------------------------------
  async function createCourse(code: string, title: string, level: Level, color: number, files: File[], readNow: boolean) {
    if (plan.payments && plan.mine === "free" && store.courses.length >= plan.free) {
      setCreating(false);
      setNeedAccount(false);
      setView("me");
      setReminderMsg(`The free plan includes ${plan.free} courses. Unlock unlimited courses with a one-time payment.`);
      return;
    }
    const c = newCourse(code, title, level, color);
    setStore((s) => ({ ...s, courses: [c, ...s.courses], currentId: c.id, plan: null }));
    setView("course");
    setCreating(false);
    setTab("notes");
    setJob(null);
    if (!files.length) return;
    const text = await addFiles(c, files);
    const hasImages = (pendingImages.current.get(c.id)?.length ?? 0) > 0;
    if (readNow && (text.trim() || hasImages)) await readNotes({ ...c, text });
  }

  function deleteCourse(id: string) {
    setImages(id, null);
    if (player.getSnapshot().queue?.courseId === id) player.clear();
    setStore((s) => ({ ...s, courses: s.courses.filter((c) => c.id !== id), currentId: null, deleted: [...s.deleted, id], plan: null }));
    setView("home");
  }

  const go = (v: View) => {
    if (busy && v !== "course") stop();
    setView(v);
    setJob(null);
  };

  const openCourse = (id: string, toTab: TabId = "notes", topic?: number) => {
    if (busy) stop();
    setStore((s) => ({ ...s, currentId: id }));
    setView("course");
    setJob(null);
    setTab(toTab);
    if (toTab === "listen" && topic !== undefined) setListenFrom({ source: "simple", topic });
  };

  function openTask(t: PlanTask) {
    openCourse(t.courseId, t.tab, t.topic);
    if (t.kind === "exam-date") setTimeout(() => document.getElementById("exam-date")?.focus(), 200);
  }

  function tick(t: PlanTask) {
    setStore((s) => {
      const list = s.planDone[today] ?? [];
      const next = list.includes(t.id) ? list.filter((x) => x !== t.id) : [...list, t.id];
      return { ...s, planDone: { ...s.planDone, [today]: next } };
    });
  }

  async function addReminder() {
    const ics = reminderIcs(profile!.reminderTime || "19:30", profile!.preferredName, location.href.split("#")[0]);
    const m = await saveText("Lectern study reminder.ics", ics);
    setReminderMsg(m || "Open the downloaded file to add the daily reminder to your calendar.");
  }

  const mini = (
    <MiniPlayer
      listeningTo={course && tab === "listen" ? course.id : null}
      colors={Object.fromEntries(store.courses.map((c) => [c.id, c.color]))}
      onOpen={(id) => openCourse(id, "listen")}
    />
  );

  const newForm = creating && (
    <NewCourseForm defaultLevel={profile.level} nextColor={store.courses.length % COURSE_COLORS} onCreate={createCourse} onCancel={() => setCreating(false)} />
  );

  const header = <Header profile={profile} view={view} onGo={go} />;

  if (!course) {
    return (
      <div className="app">
        {header}
        {view === "progress" ? (
          <ProgressView profile={profile} courses={store.courses} stats={store.stats} streak={streakN} onOpen={(id) => openCourse(id)} />
        ) : view === "groups" ? (
          <GroupsView
            profile={profile}
            courses={store.courses}
            onSignIn={() => {
              setNeedAccount(true);
              setView("me");
            }}
          />
        ) : view === "me" ? (
          <MeView
            profile={profile}
            sync={sync}
            courseCount={store.courses.length}
            openAccount={needAccount}
            notice={reminderMsg.startsWith("The free plan") ? reminderMsg : ""}
            onEdit={() => setEditingProfile(true)}
            onSyncNow={() => syncNow(true)}
            onSignedIn={() => {
              syncNow(true);
              me().then((a) => a && setPlanInfo((p) => ({ ...p, mine: a.plan })));
            }}
            onProfile={(patch) => setStore((s) => ({ ...s, profile: { ...s.profile!, ...patch, updatedAt: Date.now() } }))}
          />
        ) : (
          <Home
            profile={profile}
            courses={store.courses}
            tasks={tasks}
            isDone={doneFn}
            streak={streakN}
            todayMinutes={todayMin}
            reminderMsg={reminderMsg}
            onOpen={(id) => openCourse(id)}
            onNew={() => setCreating(true)}
            onTask={openTask}
            onTick={tick}
            onRefreshPlan={() => setStore((s) => ({ ...s, plan: null }))}
            onReminder={addReminder}
            onEditProfile={() => setEditingProfile(true)}
          />
        )}
        {mini}
        {newForm}
      </div>
    );
  }

  const pending = pendingImages.current.get(course.id)?.length ?? 0;
  const hasNotes = course.topics.length > 0;
  const d = daysUntil(course.examDate);
  const dueN = (course.cards ?? []).filter((k) => k.due <= Date.now()).length;
  const counts: Partial<Record<TabId, number>> = { mcq: course.mcq.length, theory: course.theory.length, practical: course.practical.length, cards: dueN, past: course.pastQuestions?.length ?? 0 };

  return (
    <div className={`app tone-${course.color}`}>
      {header}

      <section className="course-hero">
        <div className="hero-inner">
          <button className="back" onClick={() => go("home")}>
            ← My courses
          </button>
          <div className="hero-row">
            <div>
              <p className="hero-code">
                {course.code} · {levelLabel(course.level)}
              </p>
              <h1 className="hero-title">{course.title}</h1>
            </div>
            <div className="hero-side">
              <label className="exam-pick">
                <span>{d !== null && d >= 0 ? `Exam in ${d} day${d === 1 ? "" : "s"}${d <= 7 ? " · revision mode" : ""}` : "Exam date"}</span>
                <input
                  id="exam-date"
                  type="date"
                  value={course.examDate ?? ""}
                  onChange={(e) => {
                    update(course.id, (c) => ({ ...c, examDate: e.target.value || undefined }));
                    setStore((s) => ({ ...s, plan: null }));
                  }}
                />
              </label>
              <div className="hero-progress" aria-label="Progress">
                <span className={hasNotes ? "hp on" : "hp"}>Notes</span>
                <span className={course.topics.length && (course.studied?.length ?? 0) >= course.topics.length ? "hp on" : "hp"}>
                  {course.studied?.length ?? 0}/{course.topics.length} studied
                </span>
                <span className={(course.mocks ?? []).length ? "hp on" : "hp"}>Mock</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="layout">
        <Sidebar
          course={course}
          pendingImages={pending}
          job={job}
          busy={busy}
          onFiles={(f) => addFiles(course, f)}
          onClear={() => clearFiles(course)}
          onRead={() => readNotes(course)}
          onResume={() => readNotes(course, true)}
          onStop={stop}
          onDismiss={() => setJob(null)}
          onChange={(patch) => update(course.id, (c) => ({ ...c, ...patch }))}
          onDelete={() => deleteCourse(course.id)}
        />

        <main className="main">
          <nav className="tabs" role="tablist" aria-label="Study views">
            {TABS.map((t) => (
              <button key={t.id} role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} className={tab === t.id ? "tab on" : "tab"} onClick={() => setTab(t.id)}>
                {t.label}
                {(counts[t.id] ?? 0) > 0 && <span className="count">{counts[t.id]}</span>}
              </button>
            ))}
          </nav>

          <section className="panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
            {tab === "notes" && (
              <NotesView
                course={course}
                profile={profile}
                busy={busy}
                explaining={explaining}
                onExplain={(i, lang) => explainTopic(course, i, lang)}
                onStudied={(i, on) => {
                  markStudied(course.id, i, on);
                  if (on) log(course.id, { topics: 1 });
                }}
                onListen={(topic, source) => {
                  setListenFrom({ source, topic });
                  setTab("listen");
                }}
              />
            )}
            {tab === "summary" && (
              <SummaryView
                course={course}
                busy={busy}
                onMake={() => makeSummary(course)}
                onListen={() => {
                  setListenFrom({ source: "summary" });
                  setTab("listen");
                }}
              />
            )}
            {tab === "listen" && <ListenView course={course} start={listenFrom} onStarted={() => setListenFrom(null)} />}
            {tab === "cards" && (
              <FlashcardsView
                course={course}
                busy={busy}
                onMakeFromNotes={() => update(course.id, (c) => ({ ...c, cards: mergeCards(c.cards ?? [], cardsFromNotes(c)) }))}
                onMakeMore={(n) => moreCards(course, n)}
                onGrade={(card, g) => gradeCard(course, card, g)}
              />
            )}
            {tab === "ask" && (
              <AskView
                course={course}
                onAsk={(q) => ask(course, q)}
                onClear={() => update(course.id, (c) => ({ ...c, chat: [] }))}
                onOpenTopic={(i) => {
                  setTab("notes");
                  setTimeout(() => document.getElementById(`topic-${i}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
                }}
              />
            )}
            {tab === "mcq" && (
              <McqView
                course={course}
                busy={busy || !hasNotes}
                onGenerate={(n) => generate(course, "mcq", n)}
                onAnswer={(i, choice) => {
                  update(course.id, (c) => ({ ...c, mcqAnswers: { ...c.mcqAnswers, [i]: choice } }));
                  log(course.id, { mcqAns: 1, mcqRight: course.mcq[i]?.answer === choice ? 1 : 0 });
                }}
                onReset={() => update(course.id, (c) => ({ ...c, mcqAnswers: {} }))}
              />
            )}
            {tab === "theory" && <TheoryView course={course} busy={busy || !hasNotes} onGenerate={(n) => generate(course, "theory", n)} />}
            {tab === "practical" && <PracticalView course={course} busy={busy || !hasNotes} onGenerate={(n) => generate(course, "practical", n)} />}
            {tab === "mock" && (
              <MockView
                course={course}
                busy={busy}
                session={mocks[course.id] ?? null}
                onStart={(m, a, b) => startMock(course, m, a, b)}
                onChange={(s) => setMocks((x) => ({ ...x, [course.id]: s }))}
                onSubmit={(s) => submitMock(course, s)}
                onClose={() => setMocks((x) => ({ ...x, [course.id]: null }))}
              />
            )}
            {tab === "past" && (
              <PastView
                course={course}
                busy={busy}
                onUpload={(f) => addPastPapers(course, f)}
                onPractise={(kind) => {
                  setTab(kind);
                  generate(course, kind, kind === "mcq" ? 20 : 5);
                }}
                onClear={() => update(course.id, (c) => ({ ...c, pastQuestions: [], pastPapers: [] }))}
              />
            )}
          </section>
        </main>
      </div>
      {mini}
      {newForm}
    </div>
  );
}
