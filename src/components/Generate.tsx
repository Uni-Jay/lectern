import { useState } from "react";
import type { Course } from "../types";
import { LEVEL_FOCUS } from "../lib/prompts";
import { levelLabel } from "../types";

interface Props {
  course: Course;
  busy: boolean;
  what: string;
  counts: number[];
  hasItems: boolean;
  onGenerate: (n: number) => void;
}

export function GenerateBar({ course, busy, what, counts, hasItems, onGenerate }: Props) {
  const [n, setN] = useState(counts[0]);
  const id = `count-${what.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className="gen card">
      <div className="gen-text">
        <p>
          <strong>{levelLabel(course.level)}:</strong> <span className="muted">{LEVEL_FOCUS[course.level]}</span>
        </p>
        {!course.topics.length && <p className="muted small">Form your notes first. Questions come only from your own notes.</p>}
      </div>
      {(
        <div className="gen-actions">
          <label className="sr-only" htmlFor={id}>
            How many
          </label>
          <select id={id} value={n} onChange={(e) => setN(Number(e.target.value))}>
            {counts.map((c) => (
              <option key={c} value={c}>
                {c} {what}
              </option>
            ))}
          </select>
          <button className="btn primary" disabled={busy} onClick={() => onGenerate(n)}>
            {hasItems ? "Set new questions" : "Set questions"}
          </button>
        </div>
      )}
    </div>
  );
}
