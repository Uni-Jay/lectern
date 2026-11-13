import { useRef, useState } from "react";
import type { Level } from "../types";
import { LEVELS } from "../types";
import { ACCEPT, filesFromDrop } from "../lib/files";

interface Props {
  defaultLevel: Level;
  onCreate: (code: string, title: string, level: Level, color: number, files: File[], readNow: boolean) => void;
  onCancel: () => void;
  nextColor: number;
}

export function NewCourseForm({ defaultLevel, onCreate, onCancel, nextColor }: Props) {
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [level, setLevel] = useState<Level>(defaultLevel);
  const [color, setColor] = useState(nextColor);
  const [files, setFiles] = useState<File[]>([]);
  const [readNow, setReadNow] = useState(true);
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  const addFiles = (list: File[]) => {
    const usable = list.filter((f) => !f.name.startsWith(".") && f.size > 0);
    setFiles((cur) => [...cur, ...usable.filter((f) => !cur.some((c) => c.name === f.name && c.size === f.size))]);
  };
  const size = files.reduce((n, f) => n + f.size, 0);

  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-labelledby="new-course-h" onClick={onCancel}>
      <form
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim() && title.trim()) onCreate(code, title, level, color, files, readNow);
        }}
      >
        <div className={`sheet-preview tone-${color}`} aria-hidden="true">
          <span className="spine" />
          <span>
            <span className="tile-code">{code.trim().toUpperCase() || "CODE 000"}</span>
            <span className="tile-title">{title.trim() || "Course title"}</span>
          </span>
        </div>
        <h2 id="new-course-h">New course</h2>
        <p className="muted">One course per subject. Attach its notes below, or add them later.</p>
        <div className="row2">
          <label>
            Course code
            <input id="nc-code" placeholder="e.g. ACC 201" value={code} onChange={(e) => setCode(e.target.value)} autoFocus required />
          </label>
          <label>
            Level
            <select id="nc-level" value={level} onChange={(e) => setLevel(Number(e.target.value) as Level)}>
              {LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Course title
          <input id="nc-title" placeholder="e.g. Principles of Accounting" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        <div className="field">
          <span className="field-label">Colour</span>
          <div className="swatches">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <button
                type="button"
                key={i}
                className={`swatch tone-${i}${color === i ? " on" : ""}`}
                aria-label={`Colour ${i + 1}`}
                aria-pressed={color === i}
                onClick={() => setColor(i)}
              />
            ))}
          </div>
        </div>
        <div className="field">
          <span className="field-label">
            Your notes for this course <span className="opt-tag">you can also add them later</span>
          </span>
          <div
            className={over ? "drop compact over" : "drop compact"}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={async (e) => {
              e.preventDefault();
              setOver(false);
              addFiles(await filesFromDrop(e.dataTransfer));
            }}
          >
            <p>
              <strong>Drop files or a whole folder here</strong>
            </p>
            <p className="muted small">PDF · Word · PowerPoint · text · photos of handwritten notes</p>
            <div className="drop-actions">
              <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
                Attach files
              </button>
              <button type="button" className="btn" onClick={() => folderRef.current?.click()}>
                Attach folder
              </button>
            </div>
            <input
              ref={fileRef}
              id="nc-files"
              type="file"
              multiple
              accept={ACCEPT}
              hidden
              onChange={(e) => {
                addFiles([...(e.target.files ?? [])]);
                e.target.value = "";
              }}
            />
            <input
              ref={folderRef}
              id="nc-folder"
              type="file"
              hidden
              // @ts-expect-error non-standard but widely supported
              webkitdirectory=""
              onChange={(e) => {
                addFiles([...(e.target.files ?? [])]);
                e.target.value = "";
              }}
            />
          </div>
          {files.length > 0 && (
            <>
              <ul className="files attach-list">
                {files.map((f, i) => (
                  <li key={f.name + f.size}>
                    <span className="ficon">{(f.name.split(".").pop() ?? "file").slice(0, 4).toUpperCase()}</span>
                    <span className="fbody">
                      <span className="fname" title={f.name}>
                        {f.name}
                      </span>
                      <span className="fmeta">{f.size > 1048576 ? `${(f.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(f.size / 1024))} KB`}</span>
                    </span>
                    <button type="button" className="remove" aria-label={`Remove ${f.name}`} onClick={() => setFiles((cur) => cur.filter((_, k) => k !== i))}>
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              <p className="muted small">
                {files.length} file{files.length === 1 ? "" : "s"} · {size > 1048576 ? `${(size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`}
              </p>
              <label className="check">
                <input id="nc-readnow" type="checkbox" checked={readNow} onChange={(e) => setReadNow(e.target.checked)} />
                <span>Start reading and explaining as soon as the course is created</span>
              </label>
            </>
          )}
        </div>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!code.trim() || !title.trim()}>
            {files.length ? (readNow ? "Create and read my notes" : "Create course") : "Create course"}
          </button>
        </div>
      </form>
    </div>
  );
}
