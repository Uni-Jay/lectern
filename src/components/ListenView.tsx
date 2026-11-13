import { useEffect, useMemo, useRef, useState } from "react";
import type { Course } from "../types";
import { buildQueue } from "../lib/exporting";
import * as player from "../lib/player";
import type { ListenSource } from "../lib/player";
import { usePlayer } from "../lib/usePlayer";

export type { ListenSource };

interface Props {
  course: Course;
  start: { source: ListenSource; topic?: number } | null;
  onStarted: () => void;
}

const RATES = [0.8, 1, 1.15, 1.3, 1.5];

function topicOf(starts: number[], i: number) {
  let t = 0;
  starts.forEach((s, k) => {
    if (s <= i) t = k;
  });
  return t;
}

export function ListenView({ course, start, onStarted }: Props) {
  const p = usePlayer();
  const mine = p.queue?.courseId === course.id;
  const [source, setSource] = useState<ListenSource>(start?.source ?? (mine ? p.queue!.source : "simple"));
  const [picked, setPicked] = useState<number | null>(null);
  const [offline, setOffline] = useState("");
  const listRef = useRef<HTMLOListElement>(null);

  const queue = useMemo(() => buildQueue(course, source), [course, source]);
  const playingThis = mine && p.queue!.source === source && p.state !== "idle";
  const saved = mine && p.state !== "idle" ? -1 : player.savedPosition(course.id, source);
  const resumeAt = saved >= 0 && saved < queue.lines.length ? saved : -1;
  const current = playingThis ? p.index : picked ?? resumeAt;

  // Arrived from a "Listen" button: start reading at that topic straight away.
  useEffect(() => {
    if (!start) return;
    setSource(start.source);
    const q = buildQueue(course, start.source);
    const from = start.source === "summary" ? 0 : q.topicStarts[start.topic ?? 0] ?? 0;
    if (q.lines.length) player.playQueue(q, from);
    onStarted();
  }, [start, course, onStarted]);

  useEffect(() => {
    if (current < 0 || !listRef.current) return;
    listRef.current.querySelector<HTMLElement>(`[data-i="${current}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [current]);

  function playFrom(i: number) {
    setPicked(null);
    if (playingThis) player.playFrom(i);
    else player.playQueue(queue, i);
  }

  if (!course.topics.length) {
    return (
      <div className="empty">
        <h2>Nothing to listen to yet</h2>
        <p className="muted">Once your notes are ready, Lectern can read them to you on the bus, at lunch or while you cook.</p>
      </div>
    );
  }

  if (p.engine === "none") {
    return (
      <div className="empty">
        <h2>Read-aloud isn't available in this browser</h2>
        <p className="muted">Try Chrome or the Claude desktop app.</p>
      </div>
    );
  }

  const topicNow = playingThis ? player.currentTopic(p) : -1;
  const otherPlaying = p.queue && p.state !== "idle" && !playingThis;

  return (
    <div className="listen">
      <div className="player">
        <div className="player-top">
          <div className={playingThis && p.state === "speaking" ? "wave on" : "wave"} aria-hidden="true">
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i} />
            ))}
          </div>
          <div className="player-text">
            <p className="player-kicker">{player.sourceLabel(source)}</p>
            <p className="player-now">{topicNow >= 0 ? course.topics[topicNow]?.title : course.title}</p>
          </div>
        </div>

        <div className="seg dark" role="radiogroup" aria-label="What to read">
          {([
            ["simple", "Simple words"],
            ["notes", "Full notes"],
            ["summary", "Summary"],
          ] as const).map(([s, l]) => (
            <button
              key={s}
              role="radio"
              aria-checked={source === s}
              className={source === s ? "on" : ""}
              disabled={s === "summary" && !course.summary}
              onClick={() => {
                setSource(s);
                setPicked(null);
              }}
            >
              {l}
            </button>
          ))}
        </div>

        <div className="controls">
          <button className="skip-btn" aria-label="Previous topic" disabled={!playingThis || source === "summary"} onClick={() => player.skipTopic(-1)}>
            ⏮
          </button>
          {playingThis && (p.state === "speaking" || p.state === "loading") ? (
            <button className="play-btn" onClick={player.pause} aria-label="Pause">
              {p.state === "loading" ? <span className="spinner" /> : "❚❚"}
            </button>
          ) : playingThis && p.state === "paused" ? (
            <button className="play-btn" onClick={player.resume} aria-label="Resume">
              ▶
            </button>
          ) : (
            <button className="play-btn" onClick={() => playFrom(Math.max(0, current))} aria-label={current > 0 ? "Continue" : "Play"}>
              ▶
            </button>
          )}
          <button className="skip-btn" aria-label="Next topic" disabled={!playingThis || source === "summary"} onClick={() => player.skipTopic(1)}>
            ⏭
          </button>
          <button className="btn ghost-light" disabled={!playingThis} onClick={player.stop}>
            Stop
          </button>
          <label className="rate">
            Speed
            <select id="rate-select" value={p.rate} onChange={(e) => player.setRate(Number(e.target.value))}>
              {RATES.map((r) => (
                <option key={r} value={r}>
                  {r}×
                </option>
              ))}
            </select>
          </label>
        </div>

        {playingThis && p.note && <p className="player-note">{p.note}</p>}
        {!playingThis && picked === null && resumeAt > 0 && (
          <p className="player-note">
            You stopped at line {resumeAt + 1} of {queue.lines.length}
            {queue.topicStarts.length ? ` (${course.topics[topicOf(queue.topicStarts, resumeAt)]?.title})` : ""}. Press play to carry on from there, or{" "}
            <button
              className="linkish light"
              onClick={() => {
                player.forgetPosition(course.id, source);
                playFrom(0);
              }}
            >
              start from the beginning
            </button>
            .
          </p>
        )}
        {otherPlaying && (
          <p className="player-note">
            Now playing: {p.queue!.courseCode} · {player.sourceLabel(p.queue!.source)}. Pressing play here switches to this course.
          </p>
        )}

        <div className="player-foot">
          <label className="awake">
            <input id="keep-awake" type="checkbox" checked={p.keepAwake} onChange={(e) => player.setKeepAwake(e.target.checked)} />
            <span>Keep screen on while listening</span>
          </label>
          <p className="player-hint">
            Keeps playing while you use other tabs. {p.engine === "server" ? "Also plays with your phone locked." : "Tap any line to start there."}
          </p>
          {p.engine === "server" && (
            <button
              className="btn ghost-light"
              disabled={!!offline && !offline.startsWith("Saved")}
              onClick={() =>
                player.saveOffline(queue, (d, t) => setOffline(d < t ? `Saving ${d}/${t}…` : `Saved for offline: ${t} lines`))
              }
            >
              {offline || "Save audio for offline"}
            </button>
          )}
        </div>
      </div>

      <ol className="lines" ref={listRef}>
        {queue.lines.map((l, i) => {
          const isTopic = queue.topicStarts.includes(i);
          return (
            <li key={`${source}-${i}`} data-i={i} className={[i === current ? "now" : "", isTopic ? "topic-line" : ""].join(" ")}>
              <button onClick={() => playFrom(i)}>{l.text}</button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
