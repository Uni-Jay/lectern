import * as player from "../lib/player";
import { usePlayer } from "../lib/usePlayer";

interface Props {
  /** The course whose Listen tab is open (the big player is showing). */
  listeningTo: string | null;
  colors: Record<string, number>;
  onOpen: (courseId: string) => void;
}

/** Stays at the bottom of every screen while something is being read. */
export function MiniPlayer({ listeningTo, colors, onOpen }: Props) {
  const p = usePlayer();
  if (!p.queue || p.state === "idle" || p.queue.courseId === listeningTo) return null;
  const tone = colors[p.queue.courseId] ?? 0;
  const t = player.currentTopic(p);
  const line = p.index >= 0 ? p.queue.lines[p.index]?.text : "";
  const total = p.queue.lines.length;
  const pct = total ? Math.round(((Math.max(0, p.index) + 1) / total) * 100) : 0;

  return (
    <div className={`mini tone-${tone}`} role="region" aria-label="Now playing">
      <div className="mini-bar" style={{ width: `${pct}%` }} aria-hidden="true" />
      <button className="mini-info" onClick={() => onOpen(p.queue!.courseId)} aria-label="Open the player">
        <span className={p.state === "speaking" ? "wave small on" : "wave small"} aria-hidden="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <span key={i} />
          ))}
        </span>
        <span className="mini-text">
          <span className="mini-kicker">
            {p.queue.courseCode} · {player.sourceLabel(p.queue.source)}
            {t >= 0 ? ` · ${p.queue.topicTitles[t]}` : ""}
          </span>
          <span className="mini-line">{p.note || line}</span>
        </span>
      </button>
      <div className="mini-controls">
        {p.state === "paused" ? (
          <button className="mini-play" onClick={player.resume} aria-label="Resume">
            ▶
          </button>
        ) : (
          <button className="mini-play" onClick={player.pause} aria-label="Pause">
            {p.state === "loading" ? <span className="spinner" /> : "❚❚"}
          </button>
        )}
        <button className="mini-stop" onClick={player.stop} aria-label="Stop">
          ■
        </button>
      </div>
    </div>
  );
}
