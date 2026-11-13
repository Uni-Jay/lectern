// Spaced repetition (Leitner boxes). Cards you know come back less often;
// cards you miss come back soon.
import type { Card, Course } from "../types";

const DAY = 86400000;
const INTERVAL_DAYS = [0, 1, 3, 7, 14, 30, 60];

export type Grade = "again" | "hard" | "good" | "easy";

export function review(card: Card, grade: Grade, now = Date.now()): Card {
  let box = card.box;
  let due: number;
  if (grade === "again") {
    box = 0;
    due = now + 10 * 60000;
  } else if (grade === "hard") {
    box = Math.max(1, box);
    due = now + Math.max(1, INTERVAL_DAYS[box] / 2) * DAY;
  } else {
    box = Math.min(6, box + (grade === "easy" ? 2 : 1));
    due = now + INTERVAL_DAYS[box] * DAY;
  }
  return { ...card, box, due, reps: card.reps + 1, lapses: card.lapses + (grade === "again" ? 1 : 0) };
}

export const dueCards = (c: Course, now = Date.now()) => (c.cards ?? []).filter((k) => k.due <= now);

const cid = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return "k" + (h >>> 0).toString(36);
};

export function newCard(front: string, back: string, topic: string): Card {
  return { id: cid(front + "|" + back), front, back, topic, box: 0, due: 0, reps: 0, lapses: 0 };
}

/** Cards made straight from the notes: every key term and its meaning. */
export function cardsFromNotes(c: Course): Card[] {
  const out: Card[] = [];
  c.topics.forEach((t) => t.definitions.forEach((d) => out.push(newCard(`What is ${d.term}?`, d.meaning, t.title))));
  return out;
}

/** Add cards that aren't already in the deck (keeps progress on existing ones). */
export function mergeCards(existing: Card[], add: Card[]): Card[] {
  const ids = new Set(existing.map((k) => k.id));
  return [...existing, ...add.filter((k) => !ids.has(k.id) && (ids.add(k.id), true))];
}
