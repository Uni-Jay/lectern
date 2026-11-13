import type { Course, DayStat, Stats } from "../types";
import { addDays, dayKey, lastDays } from "./dates";

export const ZERO: DayStat = { listenSec: 0, mcqAns: 0, mcqRight: 0, cards: 0, cardsRight: 0, asks: 0, mocks: 0, mockPct: 0, topics: 0 };

export function bump(stats: Stats, courseId: string, patch: Partial<DayStat>, date = dayKey()): Stats {
  const day = stats[date] ?? {};
  const cur = { ...ZERO, ...day[courseId] };
  const next = { ...cur };
  (Object.keys(patch) as (keyof DayStat)[]).forEach((k) => (next[k] = (cur[k] ?? 0) + (patch[k] ?? 0)));
  return { ...stats, [date]: { ...day, [courseId]: next } };
}

export function dayTotal(stats: Stats, date: string, courseId?: string): DayStat {
  const day = stats[date] ?? {};
  const out = { ...ZERO };
  Object.entries(day).forEach(([cid, s]) => {
    if (courseId && cid !== courseId) return;
    (Object.keys(out) as (keyof DayStat)[]).forEach((k) => (out[k] += s[k] ?? 0));
  });
  return out;
}

/** Rough study minutes for a day's activity. */
export const minutesOf = (s: DayStat) =>
  Math.round(s.listenSec / 60 + s.mcqAns * 0.8 + s.cards * 0.25 + s.asks * 1.5 + s.mocks * 25 + s.topics * 4);

const active = (s: DayStat) => s.listenSec > 20 || s.mcqAns + s.cards + s.asks + s.mocks + s.topics > 0;

export function streak(stats: Stats, planDone: Record<string, string[]>): number {
  const has = (d: string) => active(dayTotal(stats, d)) || (planDone[d]?.length ?? 0) > 0;
  let n = 0;
  let day = new Date();
  if (!has(dayKey(day))) day = addDays(day, -1);
  while (has(dayKey(day))) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

/** Topics with the most mistakes: MCQs, mock exams and missed flashcards. */
export function weakTopics(c: Course): string[] {
  const score = new Map<string, number>();
  const add = (t: string, n: number) => t && score.set(t, (score.get(t) ?? 0) + n);
  c.mcq.forEach((q, i) => {
    const a = c.mcqAnswers[i];
    if (a !== undefined && a !== q.answer) add(q.topic, 1);
  });
  (c.mocks ?? []).slice(-3).forEach((m) => m.weakTopics.forEach((t) => add(t, 1.5)));
  (c.cards ?? []).forEach((k) => k.lapses > 0 && add(k.topic, 0.5 * k.lapses));
  return [...score.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
}

export interface CourseReport {
  course: Course;
  mcqAcc: number | null;
  mockAvg: number | null;
  coverage: number;
  predicted: number | null;
  weak: string[];
  week: DayStat;
}

export function courseReport(c: Course, stats: Stats): CourseReport {
  const answered = c.mcq.filter((_, i) => c.mcqAnswers[i] !== undefined);
  const right = c.mcq.filter((q, i) => c.mcqAnswers[i] === q.answer).length;
  const week = lastDays(7).reduce((acc, d) => {
    const s = dayTotal(stats, d, c.id);
    (Object.keys(acc) as (keyof DayStat)[]).forEach((k) => (acc[k] += s[k]));
    return acc;
  }, { ...ZERO });
  const totalAns = answered.length + week.mcqAns;
  const mcqAcc = totalAns ? (right + week.mcqRight) / totalAns : null;
  const mocks = (c.mocks ?? []).slice(-3);
  const mockAvg = mocks.length ? mocks.reduce((n, m) => n + m.percent, 0) / mocks.length / 100 : null;
  const coverage = c.topics.length ? (c.studied?.length ?? 0) / c.topics.length : 0;
  const parts: [number, number][] = [];
  if (mcqAcc !== null) parts.push([mcqAcc, 0.45]);
  if (mockAvg !== null) parts.push([mockAvg, 0.35]);
  if (parts.length) parts.push([coverage, 0.2]);
  const w = parts.reduce((n, [, x]) => n + x, 0);
  const predicted = parts.length ? Math.round((parts.reduce((n, [v, x]) => n + v * x, 0) / w) * 100) : null;
  return { course: c, mcqAcc, mockAvg, coverage, predicted, weak: weakTopics(c).slice(0, 3), week };
}
