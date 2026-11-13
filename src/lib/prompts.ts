import type { Course, Level, MockResult, PastQuestion, Profile, Topic } from "../types";
import { levelLabel } from "../types";

export const LEVEL_FOCUS: Record<Level, string> = {
  100: "recall and basic understanding: definitions, facts, simple identification",
  200: "understanding and simple application: explain, describe, give examples, short calculations",
  300: "application and analysis: apply concepts to cases, compare, solve multi-step problems",
  400: "analysis, evaluation and synthesis: critique, justify, design solutions, case studies",
  500: "advanced analysis and professional judgement: complex cases, evaluation, design and justification",
  700: "postgraduate depth: critical evaluation, theory and evidence, research-style and applied problems",
};

const TIME: Record<Profile["dailyTime"], string> = {
  "under-30": "under 30 minutes a day",
  "30-60": "30 to 60 minutes a day",
  "1-2h": "1 to 2 hours a day",
  "2h-plus": "more than 2 hours a day",
};

const STYLE: Record<Profile["explainStyle"], string> = {
  friend: "very simple, like a friend explaining over lunch: short sentences, no jargon, every technical word explained the moment it appears",
  simple: "simple and clear, keeping the important technical terms but explaining each one",
  detailed: "clear but detailed, with the reasoning behind each idea",
};

/** Who the student is, so Claude can relate everything to their life. */
export function studentContext(p: Profile | null, c: Course): string {
  if (!p) return `A ${levelLabel(c.level)} university student taking ${c.code} ${c.title}.`;
  const work =
    p.work === "no"
      ? "They are not working right now."
      : `They work ${p.work === "full-time" ? "full-time" : "part-time"}${p.occupation ? ` as/in: ${p.occupation}` : ""}.`;
  const mode = { "full-time": "full-time", "part-time": "part-time", distance: "by distance / online learning" }[p.studyMode];
  return [
    `Student: ${p.preferredName || p.fullName}, ${levelLabel(c.level)}, studying ${p.programme || "a degree"} at ${p.institution || "a university"} in ${p.country || "their country"}, ${mode}.`,
    work,
    `They have ${TIME[p.dailyTime]} to study.`,
    p.learnBy.length ? `They learn best by: ${p.learnBy.join(", ")}.` : "",
    `Course: ${c.code} ${c.title}.`,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Simple explanations go in the student's language; exam terms stay in English. */
export function languageRule(p: Profile | null, override?: string) {
  const lang = override || p?.language || "English";
  if (lang === "English") return "";
  return `Write the simple explanation (explanation, example, remember) in ${lang}. Keep technical and exam terms in English, with a short ${lang} gloss in brackets the first time. Everything else in the notes stays in English.`;
}

function relateRule(p: Profile | null) {
  if (!p) return "Use everyday examples.";
  const bits = [`everyday life in ${p.country || "their country"} (local money, places, food, transport, markets, phones)`];
  if (p.work !== "no" && p.occupation) bits.push(`their work (${p.occupation})`);
  return `Relate ideas to ${bits.join(" and to ")}. Explanation style: ${STYLE[p.explainStyle]}.`;
}

export function notesPrompt(p: Profile | null, c: Course, part: string, i: number, n: number) {
  return `You are a patient tutor forming complete study notes for this student.
${studentContext(p, c)}

Below is part ${i} of ${n} of their course material. Markers like [Page 4] or [Slide 2] show where text came from.

Read ALL of it. Turn it into notes the student can study instead of the original. Rules:
- Do not skip anything that could be examined: every concept, definition, list, process, formula, example, date and fact, in the order it appears.
- Group into topics as the material does. Use the material's own headings when it has them.
- keyPoints: one clear sentence each. Keep numbered lists and steps complete.
- "pages": the page or slide range for the topic, e.g. "p. 3–5" or "slides 2–4"; empty string if no markers.
- examTips: points likely to be examined, or common mistakes. Empty array if none.
- "simple": explain the topic in plain, layman's language, as if the student has never seen it before.
  - explanation: 2 to 4 short paragraphs (separate with \\n\\n). No jargon; if a technical word is needed, explain it in brackets right away.
  - example: ONE vivid everyday example or comparison that makes it click. ${relateRule(p)}
  - remember: one short, memorable line to hold on to.
- Facts must come from the material. The simple explanation may add everyday comparisons, never new course facts.
${languageRule(p)}

Return JSON only, in exactly this shape:
{"topics":[{"title":"","pages":"","keyPoints":[""],"definitions":[{"term":"","meaning":""}],"formulasExamples":[""],"examTips":[""],"simple":{"explanation":"","example":"","remember":""}}]}

MATERIAL (part ${i} of ${n}):
"""
${part}
"""`;
}

export function simplePrompt(p: Profile | null, c: Course, t: Topic, language?: string) {
  return `You are a patient tutor. Explain this topic in plain, layman's language for this student.
${studentContext(p, c)}
${languageRule(p, language)}

- explanation: 2 to 4 short paragraphs (separate with \\n\\n). No jargon; explain any needed technical word in brackets right away.
- example: ONE vivid everyday example or comparison that makes it click. ${relateRule(p)}
- remember: one short, memorable line.
Use only the facts in the notes below.

Return JSON only: {"explanation":"","example":"","remember":""}

TOPIC NOTES:
${notesAsText([t])}`;
}

export function notesAsText(topics: Topic[], max = 70000) {
  const s = topics
    .map((t) =>
      [
        `## ${t.title}${t.pages ? ` (${t.pages})` : ""}`,
        ...t.keyPoints.map((k) => `- ${k}`),
        ...t.definitions.map((d) => `- Definition: ${d.term}: ${d.meaning}`),
        ...t.formulasExamples.map((f) => `- Formula/example: ${f}`),
        ...t.examTips.map((e) => `- Exam tip: ${e}`),
      ].join("\n"),
    )
    .join("\n\n");
  return s.length > max ? s.slice(0, max) : s;
}

export function summaryPrompt(p: Profile | null, c: Course) {
  return `Write a revision summary for this student, from their notes below.
${studentContext(p, c)}
${relateRule(p)}

Return JSON only:
{"overview":["2 to 4 short paragraphs in plain language: what the course material covers and how the ideas connect"],
 "mustKnow":["8 to 12 one-sentence points the student must know for the exam"],
 "quickRevision":[{"topic":"topic title","oneLine":"the one thing to remember about it"}]}

Include one quickRevision entry per topic. Use only the notes.

NOTES:
${notesAsText(c.topics)}`;
}

/** Past exam questions, so new ones follow the same style. */
export function styleLine(c: Course, type: PastQuestion["type"]) {
  const past = (c.pastQuestions ?? []).filter((q) => q.type === type).slice(0, 12);
  if (!past.length) return "";
  return `\nMatch the style, wording and difficulty of these real past exam questions from this course (do not copy them):\n${past.map((q) => `- ${q.q}${q.marks ? ` (${q.marks} marks)` : ""}`).join("\n")}\n`;
}

function levelLine(c: Course) {
  return `Pitch them at ${levelLabel(c.level)}: ${LEVEL_FOCUS[c.level]}.`;
}

export function mcqPrompt(p: Profile | null, c: Course, count: number) {
  return `Set ${count} multiple-choice exam questions for this student.
${studentContext(p, c)}
${levelLine(c)}
Spread questions across all topics. Four options each, one correct, with plausible distractors. Vary which option is correct.
Every question must be answerable from the notes below. Explanations should be in plain language.
${styleLine(c, "mcq")}

Return JSON only:
{"questions":[{"q":"","options":["","","",""],"answer":0,"explanation":"why the answer is right, in one or two plain sentences","topic":"topic title"}]}
"answer" is the 0-based index of the correct option.

NOTES:
${notesAsText(c.topics)}`;
}

export function theoryPrompt(p: Profile | null, c: Course, count: number) {
  return `Set ${count} theory (essay / short-answer) exam questions for this student, in the style of a university exam paper in ${p?.country || "their country"}.
${studentContext(p, c)}
${levelLine(c)}
Give each a mark allocation (5, 10 or 15), the marking points an examiner would look for, and a model answer written the way a strong student would write it.
${styleLine(c, "theory")}
Use only the notes below.

Return JSON only:
{"questions":[{"q":"","marks":10,"markingPoints":[""],"modelAnswer":"","topic":"topic title"}]}

NOTES:
${notesAsText(c.topics)}`;
}

export function practicalPrompt(p: Profile | null, c: Course, count: number) {
  return `Set ${count} practical tasks for this student.
${studentContext(p, c)}
A practical task makes the student DO something with the material: a calculation, a program or pseudocode, a lab-style procedure, a case analysis, a design, or a real scenario, whichever fits this course.
${p && p.work !== "no" && p.occupation ? `Where it fits naturally, set scenarios in their kind of workplace (${p.occupation}).` : "Use realistic everyday scenarios."}
${levelLine(c)}
Use only concepts from the notes below.

Return JSON only:
{"tasks":[{"title":"","scenario":"the situation and what to produce","steps":["what the student should do, in order"],"solution":"a full worked solution or expected result","topic":"topic title"}]}

NOTES:
${notesAsText(c.topics)}`;
}

export const OCR_PROMPT = `These are photos or scanned pages of a student's course notes. Transcribe ALL the text exactly, in reading order, one image after another. Put "[Image n]" before each image's text. Describe any diagram in one line in square brackets. Return only the transcription.`;

export function flashcardPrompt(p: Profile | null, c: Course, count: number) {
  return `Make ${count} flashcards for this student from their notes.
${studentContext(p, c)}
Cover the most examinable facts across all topics: definitions, lists ("name the 4 ..."), steps, formulas, causes and effects, differences between similar ideas.
Front: a short question. Back: a short, exact answer (one or two lines). Use only the notes.

Return JSON only: {"cards":[{"front":"","back":"","topic":"topic title"}]}

NOTES:
${notesAsText(c.topics)}`;
}

export function askPrompt(p: Profile | null, c: Course, history: { role: string; text: string }[], question: string) {
  const turns = history.slice(-8).map((m) => `${m.role === "user" ? "Student" : "Tutor"}: ${m.text}`).join("\n");
  return `You are a friendly tutor answering a student's question using ONLY their course notes below.
${studentContext(p, c)}
${relateRule(p)}
${p && p.language !== "English" ? `Answer in ${p.language} if the student writes in it; keep exam terms in English.` : ""}

Rules:
- Answer from the notes. If the notes don't cover it, say so plainly, then give a short general answer clearly marked "Not in your notes:".
- Keep it short: a direct answer first, then a simple example if it helps.
- After each fact taken from the notes, cite the topic number like [T3].

NOTES (topics numbered):
${c.topics.map((t, i) => `[T${i + 1}] ${notesAsText([t])}`).join("\n\n").slice(0, 70000)}

CONVERSATION SO FAR:
${turns || "(none)"}

Student: ${question}
Tutor:`;
}

export function mockPrompt(p: Profile | null, c: Course, mcqs: number, theories: number) {
  return `Set a mock exam paper for this student: ${mcqs} multiple-choice questions and ${theories} theory questions.
${studentContext(p, c)}
${levelLine(c)}
Spread across all topics, like a real end-of-semester paper. Theory questions carry 10 marks each, with marking points that add up to the marks.
${styleLine(c, "mcq")}${styleLine(c, "theory")}
Use only the notes below.

Return JSON only:
{"mcq":[{"q":"","options":["","","",""],"answer":0,"explanation":"","topic":""}],
 "theory":[{"q":"","marks":10,"markingPoints":[""],"modelAnswer":"","topic":""}]}

NOTES:
${notesAsText(c.topics)}`;
}

export function gradePrompt(p: Profile | null, c: Course, items: { q: string; marks: number; markingPoints: string[]; answer: string }[]) {
  return `You are a fair but strict university examiner marking a student's theory answers.
${studentContext(p, c)}
For each question, award marks out of the total using the marking points. Give credit for correct ideas in the student's own words. A blank or off-topic answer gets 0.
Feedback: one or two plain sentences on what was good and exactly what was missing.

Return JSON only: {"results":[{"score":0,"feedback":"","missing":[""]}]} in the same order as the questions.

${items.map((it, i) => `QUESTION ${i + 1} (${it.marks} marks): ${it.q}\nMARKING POINTS:\n${it.markingPoints.map((m) => `- ${m}`).join("\n")}\nSTUDENT ANSWER:\n${it.answer.trim() || "(blank)"}`).join("\n\n")}`;
}

export function pastPaperPrompt(c: Course, paperName: string, text: string) {
  return `Below is a past exam paper for ${c.code} ${c.title}. Extract every question.
For each: the full question text, its type (mcq, theory or practical), marks (0 if not shown), the year or session if shown on the paper (else ""), and the course topic it belongs to.
Pick "topic" from this list of the student's topics (use the closest match; use "Other" if none fits):
${c.topics.map((t) => `- ${t.title}`).join("\n") || "- Other"}

Return JSON only: {"questions":[{"q":"","type":"theory","marks":0,"year":"","topic":""}]}

PAPER (${paperName}):
"""
${text.slice(0, 60000)}
"""`;
}

export function weakSummary(mocks: MockResult[]) {
  return mocks.flatMap((m) => m.weakTopics);
}
