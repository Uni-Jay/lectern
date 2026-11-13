import { useEffect, useRef, useState } from "react";
import type { ChatMsg, Course } from "../types";
import { useDictation } from "../lib/dictation";

interface Props {
  course: Course;
  onAsk: (q: string) => Promise<void>;
  onClear: () => void;
  onOpenTopic: (i: number) => void;
}

const STARTERS = ["Explain the hardest topic simply", "What will likely come out in the exam?", "Give me a real-life example of", "What's the difference between"];

/** Shows an answer with [T3]-style citations turned into topic links. */
function Answer({ text, course, onOpenTopic }: { text: string; course: Course; onOpenTopic: (i: number) => void }) {
  const parts = text.split(/(\[T\d+\])/g);
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^\[T(\d+)\]$/);
        if (!m) return <span key={i}>{part}</span>;
        const n = Number(m[1]) - 1;
        const t = course.topics[n];
        return (
          <button key={i} className="cite" onClick={() => onOpenTopic(n)} title={t ? `Open ${t.title}` : undefined}>
            {t ? t.title : `Topic ${n + 1}`}
          </button>
        );
      })}
    </>
  );
}

export function AskView({ course, onAsk, onClear, onOpenTopic }: Props) {
  const [q, setQ] = useState("");
  const [waiting, setWaiting] = useState(false);
  const chat: ChatMsg[] = course.chat ?? [];
  const endRef = useRef<HTMLDivElement>(null);
  const dict = useDictation((text) => setQ((cur) => (cur ? cur + " " : "") + text));

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [chat.length, waiting]);

  async function send(text: string) {
    const t = text.trim();
    if (!t || waiting) return;
    setQ("");
    if (dict.listening) dict.stop();
    setWaiting(true);
    try {
      await onAsk(t);
    } finally {
      setWaiting(false);
    }
  }

  if (!course.topics.length) {
    return (
      <div className="empty">
        <h2>Ask questions about your notes</h2>
        <p className="muted">Once your notes are formed, ask anything and get an answer from your own material, with the topic it came from.</p>
      </div>
    );
  }

  return (
    <div className="ask">
      <div className="chat">
        {!chat.length && (
          <div className="chat-empty">
            <p className="chat-hello">Ask me anything about {course.code}. I answer from your notes and show you where it came from.</p>
            <div className="starters">
              {STARTERS.map((s) => (
                <button key={s} className="choice" onClick={() => (s.endsWith("of") || s.endsWith("between") ? setQ(s + " ") : send(s))}>
                  {s}
                  {s.endsWith("of") || s.endsWith("between") ? "…" : ""}
                </button>
              ))}
            </div>
          </div>
        )}
        {chat.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.role === "assistant" ? <Answer text={m.text} course={course} onOpenTopic={onOpenTopic} /> : m.text}
          </div>
        ))}
        {waiting && (
          <div className="bubble assistant typing" aria-label="Thinking">
            <span />
            <span />
            <span />
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(q);
        }}
      >
        <textarea
          id="ask-input"
          rows={2}
          value={q}
          placeholder={dict.listening ? "Listening… speak your question" : "Type your question…"}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(q);
            }
          }}
        />
        <div className="composer-actions">
          {dict.available && (
            <button type="button" className={dict.listening ? "mic on" : "mic"} onClick={dict.toggle} aria-label={dict.listening ? "Stop voice input" : "Ask by voice"}>
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
                <path d="M6 11a6 6 0 0 0 12 0M12 17v4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
              </svg>
            </button>
          )}
          <button type="submit" className="btn primary" disabled={!q.trim() || waiting}>
            Ask
          </button>
        </div>
      </form>
      {chat.length > 0 && (
        <button className="linkish muted small clear-chat" onClick={onClear}>
          Clear conversation
        </button>
      )}
    </div>
  );
}
