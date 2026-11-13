// Builds "today's plan" from the student's daily time, their exam dates and
// where they are in each course.
import type { Course, Profile, Stats, TabId } from "../types";
import { dayKey, daysUntil } from "./dates";
import { dueCards } from "./srs";
import { weakTopics } from "./report";

export interface PlanTask {
  id: string;
  courseId: string;
  kind: "add-notes" | "listen" | "cards" | "mcq" | "summary" | "mock" | "weak" | "exam-date";
  title: string;
  detail: string;
  minutes: number;
  tab: TabId;
  topic?: number;
}

export const BUDGET: Record<Profile["dailyTime"], number> = { "under-30": 20, "30-60": 45, "1-2h": 90, "2h-plus": 120 };

function topicMinutes(c: Course, i: number) {
  const t = c.topics[i];
  const words = [t.simple?.explanation, t.simple?.example, ...t.keyPoints].join(" ").split(/\s+/).length;
  return Math.max(3, Math.round(words / 140));
}

export function orderCourses(courses: Course[]): Course[] {
  return [...courses].sort((a, b) => {
    const da = daysUntil(a.examDate);
    const db = daysUntil(b.examDate);
    const ka = da === null || da < 0 ? 9999 : da;
    const kb = db === null || db < 0 ? 9999 : db;
    return ka - kb || b.updatedAt - a.updatedAt;
  });
}

export function makePlan(profile: Profile, courses: Course[]): PlanTask[] {
  let left = BUDGET[profile.dailyTime];
  const tasks: PlanTask[] = [];
  const push = (t: PlanTask) => {
    tasks.push(t);
    left -= t.minutes;
  };
  let askedDate = false;

  for (const c of orderCourses(courses).slice(0, 3)) {
    if (left <= 0) break;
    const d = daysUntil(c.examDate);
    if (!c.topics.length) {
      push({
        id: `${c.id}:add-notes`,
        courseId: c.id,
        kind: "add-notes",
        title: `Add notes for ${c.code}`,
        detail: c.sources.length ? "Your files are in. Press “Read everything & explain it”." : "Upload the course files so Lectern can read them for you.",
        minutes: 5,
        tab: "notes",
      });
      continue;
    }

    const revision = d !== null && d >= 0 && d <= 7;
    if (revision) {
      push({ id: `${c.id}:summary`, courseId: c.id, kind: "summary", title: `Read the ${c.code} summary`, detail: `${d === 0 ? "Exam today" : `${d} day${d === 1 ? "" : "s"} to the exam`}. Start with the must-know points.`, minutes: 6, tab: "summary" });
      if (left >= 25) push({ id: `${c.id}:mock`, courseId: c.id, kind: "mock", title: `Take a ${left >= 45 ? 45 : 20}-minute mock exam`, detail: `${c.code}: timed, then marked, with what you missed.`, minutes: left >= 45 ? 45 : 20, tab: "mock" });
      else push({ id: `${c.id}:mcq`, courseId: c.id, kind: "mcq", title: `Answer 10 ${c.code} MCQs`, detail: "Quick check of what you know.", minutes: 10, tab: "mcq" });
      for (const w of weakTopics(c).slice(0, 2)) {
        if (left <= 0) break;
        const i = c.topics.findIndex((t) => t.title === w);
        if (i < 0) continue;
        push({ id: `${c.id}:weak:${i}`, courseId: c.id, kind: "weak", title: `Revise: ${w}`, detail: "You got questions on this wrong. Listen to it in simple words.", minutes: topicMinutes(c, i), tab: "listen", topic: i });
      }
    } else {
      const studied = new Set(c.studied ?? []);
      const next = c.topics.findIndex((_, i) => !studied.has(i));
      if (next >= 0) {
        push({
          id: `${c.id}:listen:${next}`,
          courseId: c.id,
          kind: "listen",
          title: `Learn: ${c.topics[next].title}`,
          detail: `${c.code} · topic ${next + 1} of ${c.topics.length}. Listen in simple words, then skim the full notes.`,
          minutes: topicMinutes(c, next) + 3,
          tab: "listen",
          topic: next,
        });
      }
      const due = dueCards(c).length;
      if (due > 0 && left > 0)
        push({ id: `${c.id}:cards`, courseId: c.id, kind: "cards", title: `Review ${Math.min(due, 30)} flashcards`, detail: `${c.code}: the ones due today.`, minutes: Math.max(3, Math.round(Math.min(due, 30) * 0.4)), tab: "cards" });
      if (left > 0) push({ id: `${c.id}:mcq`, courseId: c.id, kind: "mcq", title: `Answer 10 ${c.code} MCQs`, detail: c.mcq.length ? "Check what stuck." : "Set 10 questions from your notes and try them.", minutes: 10, tab: "mcq" });
    }

    if (!c.examDate && !askedDate) {
      askedDate = true;
      push({ id: `${c.id}:exam-date`, courseId: c.id, kind: "exam-date", title: `Set the ${c.code} exam date`, detail: "Your plan speeds up as the exam gets closer.", minutes: 1, tab: "notes" });
    }
  }
  return tasks;
}

/** A task counts as done when ticked, or when today's activity shows it happened. */
export function isDone(t: PlanTask, ticked: string[], stats: Stats, courses: Course[]): boolean {
  if (ticked.includes(t.id)) return true;
  const s = stats[dayKey()]?.[t.courseId] ?? {};
  const c = courses.find((x) => x.id === t.courseId);
  switch (t.kind) {
    case "add-notes":
      return !!c?.topics.length;
    case "listen":
    case "weak":
      return t.topic !== undefined && !!c?.studied?.includes(t.topic) && (s.listenSec ?? 0) > 30;
    case "cards":
      return (s.cards ?? 0) > 0 && !!c && dueCards(c).length === 0;
    case "mcq":
      return (s.mcqAns ?? 0) >= 10;
    case "mock":
      return (s.mocks ?? 0) > 0;
    case "exam-date":
      return !!c?.examDate;
    default:
      return false;
  }
}
