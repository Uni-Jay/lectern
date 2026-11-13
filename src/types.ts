export type Level = 100 | 200 | 300 | 400 | 500 | 700;

export const LEVELS: { value: Level; label: string }[] = [
  { value: 100, label: "100 level" },
  { value: 200, label: "200 level" },
  { value: 300, label: "300 level" },
  { value: 400, label: "400 level" },
  { value: 500, label: "500 level" },
  { value: 700, label: "Postgraduate" },
];

export const levelLabel = (l: Level) => LEVELS.find((x) => x.value === l)?.label ?? `${l} level`;
export const levelShort = (l: Level) => (l === 700 ? "PG" : `${l}L`);

export type ExplainStyle = "friend" | "simple" | "detailed";

export interface Profile {
  fullName: string;
  preferredName: string;
  country: string;
  institution: string;
  programme: string;
  level: Level;
  studyMode: "full-time" | "part-time" | "distance";
  work: "full-time" | "part-time" | "no";
  occupation: string;
  dailyTime: "under-30" | "30-60" | "1-2h" | "2h-plus";
  learnBy: string[];
  explainStyle: ExplainStyle;
  /** Language for simple explanations; exam terms stay in English. */
  language: string;
  /** Daily study reminder, "HH:MM" local time; empty for none. */
  reminderTime: string;
  /** WhatsApp number for reminders (self-hosted only). */
  whatsapp: string;
  createdAt: number;
  updatedAt?: number;
}

export const LANGUAGES = ["English", "Nigerian Pidgin", "Yoruba", "Hausa", "Igbo", "Twi", "Swahili", "Zulu", "Amharic", "French", "Arabic", "Portuguese"];

export interface Simple {
  explanation: string;
  example: string;
  remember: string;
}

export interface Definition {
  term: string;
  meaning: string;
}

export interface Topic {
  title: string;
  pages: string;
  keyPoints: string[];
  definitions: Definition[];
  formulasExamples: string[];
  examTips: string[];
  /** The topic explained in plain, everyday language for this student. */
  simple?: Simple;
}

export interface Summary {
  overview: string[];
  mustKnow: string[];
  quickRevision: { topic: string; oneLine: string }[];
}

export interface Mcq {
  q: string;
  options: string[];
  answer: number;
  explanation: string;
  topic: string;
}

export interface TheoryQ {
  q: string;
  marks: number;
  markingPoints: string[];
  modelAnswer: string;
  topic: string;
}

export interface PracticalTask {
  title: string;
  scenario: string;
  steps: string[];
  solution: string;
  topic: string;
}

export interface SourceFile {
  name: string;
  kind: string;
  pages: number;
  chars: number;
  note?: string;
}

export interface Card {
  id: string;
  front: string;
  back: string;
  topic: string;
  /** Spaced-repetition box 0–6; higher means known better and shown less often. */
  box: number;
  due: number;
  reps: number;
  lapses: number;
}

export interface ChatMsg {
  role: "user" | "assistant";
  text: string;
  at: number;
}

export interface MockResult {
  id: string;
  at: number;
  minutes: number;
  mcqRight: number;
  mcqTotal: number;
  theoryScore: number;
  theoryTotal: number;
  percent: number;
  weakTopics: string[];
}

export interface PastQuestion {
  q: string;
  type: "mcq" | "theory" | "practical";
  marks: number;
  year: string;
  topic: string;
  paper: string;
}

export interface Course {
  id: string;
  code: string;
  title: string;
  level: Level;
  color: number;
  sources: SourceFile[];
  /** Full extracted text of every file, with [File] and [Page n] markers. */
  text: string;
  textDropped?: boolean;
  topics: Topic[];
  summary: Summary | null;
  mcq: Mcq[];
  mcqAnswers: Record<number, number>;
  theory: TheoryQ[];
  practical: PracticalTask[];
  /** Exam date, "YYYY-MM-DD". */
  examDate?: string;
  /** Topic indexes the student has studied (read or listened through). */
  studied?: number[];
  cards?: Card[];
  chat?: ChatMsg[];
  mocks?: MockResult[];
  pastQuestions?: PastQuestion[];
  pastPapers?: string[];
  /** Set while notes are being formed, so reading can carry on after the app is closed. */
  reading?: { done: number; total: number; textLen: number };
  updatedAt: number;
}

/** What a student did on one day, per course. Used for the plan, streak and report. */
export interface DayStat {
  listenSec: number;
  mcqAns: number;
  mcqRight: number;
  cards: number;
  cardsRight: number;
  asks: number;
  mocks: number;
  mockPct: number;
  topics: number;
}

/** date ("YYYY-MM-DD") → courseId → stats */
export type Stats = Record<string, Record<string, Partial<DayStat>>>;

export type TabId = "notes" | "summary" | "listen" | "cards" | "ask" | "mcq" | "theory" | "practical" | "mock" | "past";
