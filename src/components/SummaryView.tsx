import type { Course } from "../types";

interface Props {
  course: Course;
  busy: boolean;
  onMake: () => void;
  onListen: () => void;
}

export function SummaryView({ course, busy, onMake, onListen }: Props) {
  const s = course.summary;
  if (!s) {
    return (
      <div className="empty">
        <h2>No summary yet</h2>
        <p className="muted">
          {course.topics.length
            ? "Your notes are ready. Make a short summary from them."
            : "A summary is written automatically after your notes are formed."}
        </p>
        {course.topics.length > 0 && (
          <button className="btn primary" disabled={busy} onClick={onMake}>
            Write summary
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="summary">
      <div className="toolbar">
        <p className="muted small">About a {Math.max(1, Math.round(s.overview.join(" ").split(" ").length / 200 + s.mustKnow.length / 6))} minute read</p>
        <div className="toolbar-actions">
          <button className="btn" onClick={onListen}>
            Listen to summary
          </button>
          <button className="btn" disabled={busy} onClick={onMake}>
            Rewrite
          </button>
        </div>
      </div>
      <div className="prose">
        {s.overview.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <h2 className="h-section">Must know for the exam</h2>
      <ol className="must">
        {s.mustKnow.map((m, i) => (
          <li key={i}>{m}</li>
        ))}
      </ol>
      {s.quickRevision.length > 0 && (
        <>
          <h2 className="h-section">One line per topic</h2>
          <div className="table-wrap">
            <table className="qr">
              <tbody>
                {s.quickRevision.map((r, i) => (
                  <tr key={i}>
                    <th scope="row">{r.topic}</th>
                    <td>{r.oneLine}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
