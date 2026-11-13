import type { Course } from "../types";
import { levelLabel } from "../types";
import type { ListenSource, Queue, SpeechLine } from "./player";

export function notesAsMarkdown(c: Course): string {
  const out: string[] = [`# ${c.code} · ${c.title}`, levelLabel(c.level), ""];
  if (c.summary) {
    out.push("## Summary", ...c.summary.overview, "", "### Must know", ...c.summary.mustKnow.map((m) => `- ${m}`), "");
  }
  c.topics.forEach((t, i) => {
    out.push(`## ${i + 1}. ${t.title}${t.pages ? ` (${t.pages})` : ""}`);
    if (t.simple) {
      out.push("", "### In simple words", ...t.simple.explanation.split(/\n{2,}/), "");
      if (t.simple.example) out.push(`> **Think of it like this:** ${t.simple.example}`, "");
      if (t.simple.remember) out.push(`**Remember:** ${t.simple.remember}`, "");
      out.push("### Full notes");
    }
    out.push(...t.keyPoints.map((k) => `- ${k}`));
    if (t.definitions.length) out.push("", "**Definitions**", ...t.definitions.map((d) => `- **${d.term}:** ${d.meaning}`));
    if (t.formulasExamples.length) out.push("", "**Formulas and examples**", ...t.formulasExamples.map((f) => `- ${f}`));
    if (t.examTips.length) out.push("", "**Exam tips**", ...t.examTips.map((f) => `- ${f}`));
    out.push("");
  });
  return out.join("\n");
}

/** Lines for read-aloud. `topicStarts[i]` is the line where topic i begins. */
export function notesLines(c: Course): { lines: SpeechLine[]; topicStarts: number[] } {
  const lines: SpeechLine[] = [];
  const topicStarts: number[] = [];
  const add = (text: string) => lines.push({ id: String(lines.length), text });
  c.topics.forEach((t, i) => {
    topicStarts.push(lines.length);
    add(`Topic ${i + 1}: ${t.title}.`);
    t.keyPoints.forEach(add);
    t.definitions.forEach((d) => add(`Definition. ${d.term}: ${d.meaning}`));
    t.formulasExamples.forEach((f) => add(f));
    t.examTips.forEach((e) => add(`Exam tip: ${e}`));
  });
  return { lines, topicStarts };
}

/** Lines for the simple explanations only. */
export function simpleLines(c: Course): { lines: SpeechLine[]; topicStarts: number[] } {
  const lines: SpeechLine[] = [];
  const topicStarts: number[] = [];
  const add = (text: string) => lines.push({ id: String(lines.length), text });
  c.topics.forEach((t, i) => {
    if (!t.simple) {
      topicStarts.push(lines.length);
      add(`Topic ${i + 1}: ${t.title}.`);
      t.keyPoints.forEach(add);
      return;
    }
    topicStarts.push(lines.length);
    add(`Topic ${i + 1}: ${t.title}.`);
    t.simple.explanation.split(/\n{2,}/).forEach(add);
    if (t.simple.example) add(`Think of it like this. ${t.simple.example}`);
    if (t.simple.remember) add(`Remember: ${t.simple.remember}`);
  });
  return { lines, topicStarts };
}

export function summaryLines(c: Course): SpeechLine[] {
  if (!c.summary) return [];
  const texts = [
    `Summary of ${c.code}, ${c.title}.`,
    ...c.summary.overview,
    "Points you must know.",
    ...c.summary.mustKnow,
  ];
  return texts.map((text, i) => ({ id: String(i), text }));
}

let downloadsPromise: Promise<ClaudeDownloads | null> | null = null;

/** Save a text file. Returns a short message for the user. */
export async function saveText(filename: string, text: string): Promise<string> {
  if (!downloadsPromise) {
    downloadsPromise = window.claude?.use ? window.claude.use("downloads").catch(() => null) : Promise.resolve(null);
  }
  const dl = await downloadsPromise;
  if (dl) {
    try {
      await dl.save({ filename, data: text });
      return "";
    } catch {
      return "Download cancelled.";
    }
  }
  if (window.claude) {
    try {
      await navigator.clipboard.writeText(text);
      return "Downloads aren't available here, so the notes were copied. Paste them into Word or Google Docs.";
    } catch {
      return "Downloads aren't available here.";
    }
  }
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return "";
}

export function buildQueue(c: Course, source: ListenSource): Queue {
  const set =
    source === "notes" ? notesLines(c) : source === "simple" ? simpleLines(c) : { lines: summaryLines(c), topicStarts: [] as number[] };
  return {
    courseId: c.id,
    courseCode: c.code,
    courseTitle: c.title,
    source,
    lines: set.lines,
    topicStarts: set.topicStarts,
    topicTitles: source === "summary" ? [] : c.topics.map((t) => t.title),
  };
}
