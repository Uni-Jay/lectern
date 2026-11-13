import { useState } from "react";
import type { Course } from "../types";
import { GenerateBar } from "./Generate";

interface Props {
  course: Course;
  busy: boolean;
  onGenerate: (n: number) => void;
}

export function TheoryView({ course, busy, onGenerate }: Props) {
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const total = course.theory.reduce((n, q) => n + (Number(q.marks) || 0), 0);
  return (
    <div className="quiz">
      <GenerateBar course={course} busy={busy} what="questions" counts={[5, 8, 12]} hasItems={course.theory.length > 0} onGenerate={onGenerate} />
      {!course.theory.length ? (
        <div className="empty">
          <h2>No theory questions yet</h2>
          <p className="muted">Exam-style questions with mark allocations, marking guides and model answers.</p>
        </div>
      ) : (
        <p className="muted small">
          {course.theory.length} questions · {total} marks. Write your answer first, then check the marking guide.
        </p>
      )}
      <ol className="qlist">
        {course.theory.map((q, i) => (
          <li key={i} className="q card">
            <div className="qhead">
              <p className="qtext">
                <span className="qnum">{i + 1}.</span> {q.q}
              </p>
              <span className="marks">{q.marks} marks</span>
            </div>
            <button className="linkish" aria-expanded={!!open[i]} onClick={() => setOpen((o) => ({ ...o, [i]: !o[i] }))}>
              {open[i] ? "Hide marking guide" : "Show marking guide"}
            </button>
            {open[i] && (
              <div className="reveal">
                <h3>Marking points</h3>
                <ul>
                  {q.markingPoints.map((m, j) => (
                    <li key={j}>{m}</li>
                  ))}
                </ul>
                <h3>Model answer</h3>
                <p>{q.modelAnswer}</p>
                {q.topic && <p className="muted small">Topic: {q.topic}</p>}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
