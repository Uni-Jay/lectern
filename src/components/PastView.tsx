import { useRef } from "react";
import type { Course } from "../types";
import { ACCEPT } from "../lib/files";

interface Props {
  course: Course;
  busy: boolean;
  onUpload: (files: File[]) => void;
  onPractise: (kind: "mcq" | "theory") => void;
  onClear: () => void;
}

export function PastView({ course, busy, onUpload, onPractise, onClear }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const qs = course.pastQuestions ?? [];
  const counts = new Map<string, number>();
  qs.forEach((q) => counts.set(q.topic || "Other", (counts.get(q.topic || "Other") ?? 0) + 1));
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const max = ranked[0]?.[1] ?? 1;
  const years = [...new Set(qs.map((q) => q.year).filter(Boolean))];

  return (
    <div className="quiz">
      <div className="card past-intro">
        <div>
          <h2 className="h-small">Past questions</h2>
          <p className="muted">
            Upload old exam papers for {course.code} (PDF, Word or photos). Lectern pulls out every question, shows which topics come up most, and sets new
            practice questions in the same style.
          </p>
        </div>
        <div className="row-btns">
          <button className="btn primary" disabled={busy || !course.topics.length} onClick={() => ref.current?.click()}>
            Upload past papers
          </button>
          <input
            ref={ref}
            id="past-input"
            type="file"
            multiple
            accept={ACCEPT}
            hidden
            onChange={(e) => {
              onUpload([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
        </div>
        {!course.topics.length && <p className="muted small">Form your notes first, so each question can be matched to a topic.</p>}
      </div>

      {qs.length > 0 && (
        <>
          <div className="card">
            <div className="card-head">
              <h3 className="h-small">Topics that come up most</h3>
              <span className="muted small">
                {qs.length} questions from {(course.pastPapers ?? []).length} paper{(course.pastPapers ?? []).length === 1 ? "" : "s"}
                {years.length ? ` · ${years.join(", ")}` : ""}
              </span>
            </div>
            <ul className="freq">
              {ranked.map(([t, n]) => (
                <li key={t}>
                  <span className="freq-label">{t}</span>
                  <span className="freq-track">
                    <span className="freq-bar" style={{ width: `${(n / max) * 100}%` }} />
                  </span>
                  <span className="freq-n">{n}</span>
                </li>
              ))}
            </ul>
            <div className="row-btns">
              <button className="btn" disabled={busy} onClick={() => onPractise("mcq")}>
                Set MCQs in this style
              </button>
              <button className="btn" disabled={busy} onClick={() => onPractise("theory")}>
                Set theory in this style
              </button>
            </div>
          </div>

          <ol className="qlist">
            {qs.map((q, i) => (
              <li key={i} className="q card past-q">
                <div className="qhead">
                  <p className="qtext">{q.q}</p>
                  {q.marks > 0 && <span className="marks">{q.marks} marks</span>}
                </div>
                <p className="muted small">
                  {q.topic || "Other"} · {q.type}
                  {q.year ? ` · ${q.year}` : ""} · {q.paper}
                </p>
              </li>
            ))}
          </ol>
          <button className="linkish muted small" onClick={onClear}>
            Remove all past questions
          </button>
        </>
      )}
    </div>
  );
}
