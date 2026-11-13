import type { Course } from "../types";
import { GenerateBar } from "./Generate";

interface Props {
  course: Course;
  busy: boolean;
  onGenerate: (n: number) => void;
  onAnswer: (i: number, choice: number) => void;
  onReset: () => void;
}

const LETTERS = ["A", "B", "C", "D", "E"];

export function McqView({ course, busy, onGenerate, onAnswer, onReset }: Props) {
  const { mcq, mcqAnswers } = course;
  const answered = Object.keys(mcqAnswers).length;
  const correct = mcq.filter((q, i) => mcqAnswers[i] === q.answer).length;
  const weak = new Map<string, number>();
  mcq.forEach((q, i) => {
    if (mcqAnswers[i] !== undefined && mcqAnswers[i] !== q.answer) weak.set(q.topic, (weak.get(q.topic) ?? 0) + 1);
  });

  return (
    <div className="quiz">
      <GenerateBar course={course} busy={busy} what="questions" counts={[10, 20, 30, 50]} hasItems={mcq.length > 0} onGenerate={onGenerate} />

      {mcq.length > 0 && (
        <div className="score" aria-live="polite">
          <span className="score-num">
            {correct}/{answered || 0}
          </span>
          <span className="muted small">
            correct · {mcq.length - answered} left
          </span>
          {answered > 0 && (
            <button className="linkish" onClick={onReset}>
              Start again
            </button>
          )}
        </div>
      )}
      {weak.size > 0 && (
        <p className="weak small">
          Revise:{" "}
          {[...weak.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => (
            <span className="chip" key={t}>
              {t} ({n} wrong)
            </span>
          ))}
        </p>
      )}

      {!mcq.length && (
        <div className="empty">
          <h2>No MCQs yet</h2>
          <p className="muted">Choose how many, then set questions from your notes.</p>
        </div>
      )}

      <ol className="qlist">
        {mcq.map((q, i) => {
          const chosen = mcqAnswers[i];
          const done = chosen !== undefined;
          return (
            <li key={i} className="q card">
              <p className="qtext">
                <span className="qnum">{i + 1}.</span> {q.q}
              </p>
              <div className="opts">
                {q.options.map((o, j) => {
                  const cls = !done ? "" : j === q.answer ? "right" : j === chosen ? "wrong" : "dim";
                  return (
                    <button key={j} className={`opt ${cls}`} disabled={done} onClick={() => onAnswer(i, j)}>
                      <span className="letter">{LETTERS[j]}</span>
                      <span>{o}</span>
                    </button>
                  );
                })}
              </div>
              {done && (
                <p className={chosen === q.answer ? "explain good" : "explain bad"}>
                  <strong>{chosen === q.answer ? "Correct." : `Answer: ${LETTERS[q.answer]}.`}</strong> {q.explanation}
                  {q.topic && <span className="muted"> · {q.topic}</span>}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
