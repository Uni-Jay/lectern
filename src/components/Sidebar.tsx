import { useRef, useState } from "react";
import type { Course, Level } from "../types";
import { LEVELS } from "../types";
import type { Job } from "../App";
import { ACCEPT, filesFromDrop } from "../lib/files";

interface Props {
  course: Course;
  pendingImages: number;
  job: Job | null;
  busy: boolean;
  onFiles: (files: File[]) => void;
  onClear: () => void;
  onRead: () => void;
  onResume: () => void;
  onStop: () => void;
  onDismiss: () => void;
  onChange: (patch: Partial<Course>) => void;
  onDelete: () => void;
}

const KIND_ICON: Record<string, string> = { PDF: "PDF", Word: "DOC", Slides: "PPT", Text: "TXT", Photo: "IMG" };

export function Sidebar(p: Props) {
  const { course } = p;
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const pages = course.sources.reduce((n, s) => n + s.pages, 0);
  const canRead = !p.busy && (course.text.trim().length > 0 || p.pendingImages > 0);

  return (
    <aside className="side">
      <div className="card">
        <div className="card-head">
          <h2 className="h-small">Course materials</h2>
          <label className="level-pick">
            <span className="sr-only">Level for questions</span>
            <select id="level-select" value={course.level} onChange={(e) => p.onChange({ level: Number(e.target.value) as Level })}>
              {LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div
          className={over ? "drop over" : "drop"}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={async (e) => {
            e.preventDefault();
            setOver(false);
            p.onFiles(await filesFromDrop(e.dataTransfer));
          }}
        >
          <svg className="drop-icon" viewBox="0 0 48 48" aria-hidden="true">
            <rect x="9" y="6" width="26" height="34" rx="4" fill="var(--tone-soft)" />
            <rect x="14" y="12" width="26" height="32" rx="4" fill="var(--tone)" />
            <path d="M27 22v13M21.5 27.5 27 22l5.5 5.5" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p>
            <strong>Drop files or a whole folder</strong>
          </p>
          <p className="muted small">PDF · Word · PowerPoint · text · photos of handwritten notes</p>
          <div className="drop-actions">
            <button className="btn" disabled={p.busy} onClick={() => fileRef.current?.click()}>
              Choose files
            </button>
            <button className="btn" disabled={p.busy} onClick={() => folderRef.current?.click()}>
              Choose folder
            </button>
          </div>
          <input
            ref={fileRef}
            id="file-input"
            type="file"
            multiple
            accept={ACCEPT}
            hidden
            onChange={(e) => {
              p.onFiles([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
          <input
            ref={folderRef}
            id="folder-input"
            type="file"
            hidden
            // @ts-expect-error non-standard but widely supported
            webkitdirectory=""
            onChange={(e) => {
              p.onFiles([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
        </div>

        {course.sources.length > 0 && (
          <ul className="files">
            {course.sources.map((s) => (
              <li key={s.name}>
                <span className="ficon">{KIND_ICON[s.kind] ?? "FILE"}</span>
                <span className="fbody">
                  <span className="fname" title={s.name}>
                    {s.name}
                  </span>
                  <span className="fmeta">
                    {s.pages ? `${s.pages} ${s.kind === "Slides" ? "slides" : s.pages === 1 ? "page" : "pages"}` : s.kind}
                    {s.note ? ` · ${s.note}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {course.sources.length > 0 && (
          <p className="muted small tally">
            {course.sources.length} file{course.sources.length === 1 ? "" : "s"}
            {pages ? ` · ${pages} pages` : ""}
            {p.pendingImages ? ` · ${p.pendingImages} photo${p.pendingImages === 1 ? "" : "s"} to read` : ""}
            {" · "}
            <button className="linkish" disabled={p.busy} onClick={p.onClear}>
              Remove all
            </button>
          </p>
        )}
        {course.textDropped && (
          <p className="warn small">Your notes are saved, but the original files were too large to keep on this device. Upload them again to re-read.</p>
        )}

        {course.reading && !p.busy && course.reading.done < course.reading.total + 1 && (
          <div className="resume">
            <p>
              <strong>Reading stopped at part {Math.min(course.reading.done + 1, course.reading.total)} of {course.reading.total}.</strong>{" "}
              {course.reading.done ? `${course.topics.length} topic${course.topics.length === 1 ? " is" : "s are"} already done.` : ""}
            </p>
            {course.text.length === course.reading.textLen ? (
              <button className="btn primary wide" onClick={p.onResume}>
                Continue reading from part {Math.min(course.reading.done + 1, course.reading.total)}
              </button>
            ) : (
              <p className="small">Upload the files again to finish reading.</p>
            )}
          </div>
        )}

        <button className={course.reading && !p.busy ? "btn wide big" : "btn primary wide big"} disabled={!canRead} onClick={p.onRead}>
          {course.topics.length ? "Read again and rebuild notes" : "Read everything & explain it"}
        </button>
        {!course.sources.length && <p className="muted small center">Add files first. Nothing is read until you press this.</p>}

        {p.job && (
          <div className={p.job.error ? "job error" : "job"} role="status" aria-live="polite">
            <p>{p.job.error ?? p.job.label}</p>
            {!p.job.error && (
              <div className="bar" aria-hidden="true">
                <span style={{ width: `${Math.max(6, (p.job.done / Math.max(1, p.job.total)) * 100)}%` }} />
              </div>
            )}
            <button className="linkish" onClick={p.job.error ? p.onDismiss : p.onStop}>
              {p.job.error ? "Dismiss" : "Stop"}
            </button>
          </div>
        )}
      </div>

      <div className="danger-zone">
        {confirmDelete ? (
          <>
            <span className="small">Delete {course.code} and its notes?</span>
            <button className="btn danger" onClick={p.onDelete}>
              Delete
            </button>
            <button className="btn ghost" onClick={() => setConfirmDelete(false)}>
              Keep
            </button>
          </>
        ) : (
          <button className="linkish muted" onClick={() => setConfirmDelete(true)}>
            Delete this course
          </button>
        )}
      </div>
    </aside>
  );
}
