import { useState } from "react";
import type { Course, Profile } from "../types";
import { LANGUAGES } from "../types";
import { notesAsMarkdown, saveText } from "../lib/exporting";
import type { ListenSource } from "./ListenView";

interface Props {
  course: Course;
  profile: Profile;
  busy: boolean;
  explaining: number | null;
  onExplain: (topic: number, language?: string) => void;
  onStudied: (topic: number, on: boolean) => void;
  onListen: (topic: number, source: ListenSource) => void;
}

type Mode = "both" | "simple" | "full";

export function NotesView({ course, profile, busy, explaining, onExplain, onStudied, onListen }: Props) {
  const [msg, setMsg] = useState("");
  const [mode, setMode] = useState<Mode>("both");
  const { topics } = course;

  if (!topics.length) {
    return (
      <div className="empty">
        <svg className="empty-art" viewBox="0 0 120 90" aria-hidden="true">
          <rect x="18" y="14" width="46" height="62" rx="6" fill="var(--tone-soft)" />
          <rect x="56" y="14" width="46" height="62" rx="6" fill="var(--tone)" />
          <rect x="26" y="28" width="28" height="4" rx="2" fill="var(--tone)" opacity=".5" />
          <rect x="26" y="38" width="22" height="4" rx="2" fill="var(--tone)" opacity=".5" />
          <rect x="64" y="28" width="28" height="4" rx="2" fill="#fff" opacity=".7" />
          <rect x="64" y="38" width="20" height="4" rx="2" fill="#fff" opacity=".7" />
          <circle cx="98" cy="18" r="10" fill="var(--sun)" />
        </svg>
        <h2>{busy ? "Reading your materials…" : "Your notes will appear here"}</h2>
        <p className="muted">
          {busy
            ? "Each topic shows up as soon as it's read. You can watch it build."
            : `Add your course files, then press “Read everything & explain it”. Every page becomes clear notes, plus a simple explanation of each topic using examples from ${profile.work !== "no" && profile.occupation ? "your work and " : ""}everyday life.`}
        </p>
      </div>
    );
  }

  const points = topics.reduce((n, t) => n + t.keyPoints.length, 0);

  return (
    <div className="notes">
      <div className="toolbar">
        <div className="seg" role="radiogroup" aria-label="What to show">
          {([
            ["both", "Simple + full notes"],
            ["simple", "Simple words only"],
            ["full", "Full notes only"],
          ] as const).map(([v, l]) => (
            <button key={v} role="radio" aria-checked={mode === v} className={mode === v ? "on" : ""} onClick={() => setMode(v)}>
              {l}
            </button>
          ))}
        </div>
        <div className="toolbar-actions">
          <button className="btn" onClick={() => onListen(0, mode === "full" ? "notes" : "simple")}>
            ▶ Listen
          </button>
          <button className="btn" onClick={async () => setMsg(await saveText(`${course.code} notes.md`, notesAsMarkdown(course)))}>
            Download
          </button>
        </div>
      </div>
      <p className="muted small meta-line">
        {topics.length} topic{topics.length === 1 ? "" : "s"} · {points} key points{busy ? " · still reading…" : ""}
      </p>
      {msg && <p className="muted small">{msg}</p>}

      <nav className="toc" aria-label="Topics">
        {topics.map((t, i) => (
          <a
            key={i}
            href={`#topic-${i}`}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(`topic-${i}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            <span className="toc-n">{i + 1}</span>
            {t.title}
          </a>
        ))}
      </nav>

      {topics.map((t, i) => (
        <article className="topic" id={`topic-${i}`} key={i}>
          <header className="topic-head">
            <span className="tnum">{String(i + 1).padStart(2, "0")}</span>
            <div className="topic-titles">
              <h2>{t.title}</h2>
              {t.pages && <span className="ref">from {t.pages}</span>}
            </div>
            <button
              className={course.studied?.includes(i) ? "studied on" : "studied"}
              aria-pressed={!!course.studied?.includes(i)}
              onClick={() => onStudied(i, !course.studied?.includes(i))}
            >
              {course.studied?.includes(i) ? "✓ Studied" : "Mark studied"}
            </button>
          </header>

          {mode !== "full" &&
            (t.simple ? (
              <div className="simple">
                <div className="simple-head">
                  <span className="bulb" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="18" height="18">
                      <path d="M12 2a7 7 0 0 0-4 12.7V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.3A7 7 0 0 0 12 2z" fill="currentColor" />
                      <rect x="9" y="19.5" width="6" height="2.5" rx="1.2" fill="currentColor" />
                    </svg>
                  </span>
                  <h3>In simple words</h3>
                  <button className="linkish small" onClick={() => onListen(i, "simple")}>
                    ▶ Listen
                  </button>
                </div>
                {t.simple.explanation.split(/\n{2,}/).map((para, j) => (
                  <p key={j}>{para}</p>
                ))}
                {t.simple.example && (
                  <div className="example">
                    <span className="ex-label">Think of it like this</span>
                    <p>{t.simple.example}</p>
                  </div>
                )}
                {t.simple.remember && (
                  <p className="remember">
                    <span>Remember:</span> {t.simple.remember}
                  </p>
                )}
                <label className="relang">
                  <span>{explaining === i ? "Explaining…" : "Explain again in"}</span>
                  <select
                    id={`relang-${i}`}
                    value=""
                    disabled={explaining !== null || busy}
                    onChange={(e) => e.target.value && onExplain(i, e.target.value)}
                  >
                    <option value="">choose a language</option>
                    {LANGUAGES.map((l) => (
                      <option key={l} value={l}>
                        {l}
                        {l === profile.language ? " (yours)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : (
              <div className="simple pending">
                <p>This topic doesn't have a simple explanation yet.</p>
                <button className="btn" disabled={explaining !== null || busy} onClick={() => onExplain(i)}>
                  {explaining === i ? "Explaining…" : "Explain this in simple words"}
                </button>
              </div>
            ))}

          {mode !== "simple" && (
            <div className="full">
              {mode === "both" && (
                <div className="full-head">
                  <h3>Full notes</h3>
                  <button className="linkish small" onClick={() => onListen(i, "notes")}>
                    ▶ Listen
                  </button>
                </div>
              )}
              {t.keyPoints.length > 0 && (
                <ul className="points">
                  {t.keyPoints.map((k, j) => (
                    <li key={j}>{k}</li>
                  ))}
                </ul>
              )}

              {t.definitions.length > 0 && (
                <div className="block">
                  <h4>Key terms</h4>
                  <dl className="defs">
                    {t.definitions.map((d, j) => (
                      <div key={j}>
                        <dt>{d.term}</dt>
                        <dd>{d.meaning}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              {t.formulasExamples.length > 0 && (
                <div className="block">
                  <h4>Formulas and examples</h4>
                  <ul className="mono-list">
                    {t.formulasExamples.map((f, j) => (
                      <li key={j}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}

              {t.examTips.length > 0 && (
                <div className="tips">
                  <h4>Exam tips</h4>
                  <ul>
                    {t.examTips.map((f, j) => (
                      <li key={j}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
