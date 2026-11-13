import { useState } from "react";
import type { Course } from "../types";
import { GenerateBar } from "./Generate";

interface Props {
  course: Course;
  busy: boolean;
  onGenerate: (n: number) => void;
}

export function PracticalView({ course, busy, onGenerate }: Props) {
  const [open, setOpen] = useState<Record<number, boolean>>({});
  return (
    <div className="quiz">
      <GenerateBar course={course} busy={busy} what="tasks" counts={[3, 5, 8]} hasItems={course.practical.length > 0} onGenerate={onGenerate} />
      {!course.practical.length && (
        <div className="empty">
          <h2>No practical tasks yet</h2>
          <p className="muted">Hands-on tasks that fit the course: calculations, code, procedures, case studies or workplace scenarios.</p>
        </div>
      )}
      <ol className="qlist">
        {course.practical.map((t, i) => (
          <li key={i} className="q card">
            <h3 className="ptitle">
              <span className="qnum">{i + 1}.</span> {t.title}
            </h3>
            <p>{t.scenario}</p>
            <h4>What to do</h4>
            <ol className="steps">
              {t.steps.map((s, j) => (
                <li key={j}>{s}</li>
              ))}
            </ol>
            <button className="linkish" aria-expanded={!!open[i]} onClick={() => setOpen((o) => ({ ...o, [i]: !o[i] }))}>
              {open[i] ? "Hide solution" : "Show solution"}
            </button>
            {open[i] && (
              <div className="reveal">
                <p className="pre">{t.solution}</p>
                {t.topic && <p className="muted small">Topic: {t.topic}</p>}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
