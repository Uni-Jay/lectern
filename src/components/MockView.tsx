import { useEffect, useState } from "react";
import type { Course, Mcq, MockResult, TheoryQ } from "../types";

export interface MockSession {
  paper: { mcq: Mcq[]; theory: TheoryQ[] };
  minutes: number;
  startedAt: number;
  /** Exam time used so far; the clock stops while the app is closed. */
  usedMs?: number;
  resumedAt?: number;
  answers: Record<number, number>;
  written: Record<number, string>;
  phase: "running" | "marking" | "done";
  graded?: { score: number; feedback: string; missing: string[] }[];
  result?: MockResult;
}

interface Props {
  course: Course;
  busy: boolean;
  session: MockSession | null;
  onStart: (minutes: number, mcqs: number, theories: number) => void;
  onChange: (s: MockSession) => void;
  onSubmit: (s: MockSession) => void;
  onClose: () => void;
}

const SETUPS = [
  { minutes: 20, mcqs: 15, theories: 1, label: "Quick", desc: "20 min · 15 MCQs + 1 theory" },
  { minutes: 45, mcqs: 25, theories: 2, label: "Standard", desc: "45 min · 25 MCQs + 2 theory" },
  { minutes: 90, mcqs: 40, theories: 4, label: "Full paper", desc: "90 min · 40 MCQs + 4 theory" },
];

const LETTERS = ["A", "B", "C", "D", "E"];

function fmt(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function MockView({ course, busy, session, onStart, onChange, onSubmit, onClose }: Props) {
  const [now, setNow] = useState(Date.now());
  const running = session?.phase === "running";

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  const left = session ? session.minutes * 60000 - (session.usedMs ?? 0) - (now - (session.resumedAt ?? session.startedAt)) : 0;
  useEffect(() => {
    if (running && session && left <= 0) onSubmit(session);
  }, [running, left, session, onSubmit]);

  if (!course.topics.length) {
    return (
      <div className="empty">
        <h2>Mock exams need your notes</h2>
        <p className="muted">Form your notes first. Then sit a timed paper and get it marked.</p>
      </div>
    );
  }

  if (!session) {
    const past = course.mocks ?? [];
    return (
      <div className="quiz">
        <div className="card mock-intro">
          <h2>Sit a mock exam</h2>
          <p className="muted">A fresh paper from your notes, against the clock. MCQs are marked at once, and Claude marks your written answers against the marking points and tells you what you missed.</p>
          <div className="setups">
            {SETUPS.map((s) => (
              <button key={s.label} className="setup" disabled={busy} onClick={() => onStart(s.minutes, s.mcqs, s.theories)}>
                <strong>{s.label}</strong>
                <span>{s.desc}</span>
              </button>
            ))}
          </div>
        </div>
        {past.length > 0 && (
          <div className="card">
            <h3 className="h-small">Your past mocks</h3>
            <ul className="mock-history">
              {[...past].reverse().map((m) => (
                <li key={m.id}>
                  <span className={m.percent >= 50 ? "pct good" : "pct bad"}>{m.percent}%</span>
                  <span>
                    {new Date(m.at).toLocaleDateString(undefined, { day: "numeric", month: "short" })} · {m.minutes} min · MCQ {m.mcqRight}/{m.mcqTotal}
                    {m.theoryTotal ? ` · theory ${m.theoryScore}/${m.theoryTotal}` : ""}
                  </span>
                  {m.weakTopics.length > 0 && <span className="muted small">Revise: {m.weakTopics.slice(0, 3).join(", ")}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  const { paper } = session;
  const done = session.phase === "done";
  const answered = Object.keys(session.answers).length + Object.values(session.written).filter((w) => w.trim()).length;
  const total = paper.mcq.length + paper.theory.length;

  return (
    <div className="mock">
      <div className={done ? "mock-bar done" : left < 5 * 60000 ? "mock-bar hurry" : "mock-bar"}>
        {done && session.result ? (
          <>
            <span className="mock-score">{session.result.percent}%</span>
            <span>
              MCQ {session.result.mcqRight}/{session.result.mcqTotal}
              {session.result.theoryTotal ? ` · Theory ${session.result.theoryScore}/${session.result.theoryTotal}` : ""}
            </span>
            <button className="btn" onClick={onClose}>
              Close paper
            </button>
          </>
        ) : session.phase === "marking" ? (
          <span>Marking your paper…</span>
        ) : (
          <>
            <span className="timer" aria-live="off">
              {fmt(left)}
            </span>
            <span className="muted-light">
              {answered}/{total} answered
            </span>
            <button className="btn primary" onClick={() => onSubmit(session)}>
              Submit paper
            </button>
          </>
        )}
      </div>

      {done && session.result && session.result.weakTopics.length > 0 && (
        <p className="weak small">
          Revise:{" "}
          {session.result.weakTopics.map((t) => (
            <span className="chip" key={t}>
              {t}
            </span>
          ))}
        </p>
      )}

      <h3 className="paper-h">Section A · Multiple choice</h3>
      <ol className="qlist">
        {paper.mcq.map((q, i) => {
          const chosen = session.answers[i];
          return (
            <li key={i} className="q card">
              <p className="qtext">
                <span className="qnum">{i + 1}.</span> {q.q}
              </p>
              <div className="opts">
                {q.options.map((o, j) => {
                  const cls = done ? (j === q.answer ? "right" : j === chosen ? "wrong" : "dim") : chosen === j ? "picked" : "";
                  return (
                    <button key={j} className={`opt ${cls}`} disabled={done || session.phase !== "running"} onClick={() => onChange({ ...session, answers: { ...session.answers, [i]: j } })}>
                      <span className="letter">{LETTERS[j]}</span>
                      <span>{o}</span>
                    </button>
                  );
                })}
              </div>
              {done && <p className={chosen === q.answer ? "explain good" : "explain bad"}>{chosen === undefined ? <strong>Not answered. </strong> : null}{q.explanation}</p>}
            </li>
          );
        })}
      </ol>

      {paper.theory.length > 0 && <h3 className="paper-h">Section B · Theory</h3>}
      <ol className="qlist">
        {paper.theory.map((q, i) => {
          const g = session.graded?.[i];
          return (
            <li key={i} className="q card">
              <div className="qhead">
                <p className="qtext">
                  <span className="qnum">{i + 1}.</span> {q.q}
                </p>
                <span className="marks">{done && g ? `${g.score}/${q.marks}` : `${q.marks} marks`}</span>
              </div>
              <textarea
                id={`mock-theory-${i}`}
                className="answer-box"
                rows={7}
                placeholder="Write your answer here, as you would in the exam."
                value={session.written[i] ?? ""}
                readOnly={session.phase !== "running"}
                onChange={(e) => onChange({ ...session, written: { ...session.written, [i]: e.target.value } })}
              />
              {done && g && (
                <div className="reveal">
                  <p>
                    <strong>Examiner:</strong> {g.feedback}
                  </p>
                  {g.missing.length > 0 && (
                    <>
                      <h3>What you missed</h3>
                      <ul>
                        {g.missing.map((m, j) => (
                          <li key={j}>{m}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  <h3>Model answer</h3>
                  <p>{q.modelAnswer}</p>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
