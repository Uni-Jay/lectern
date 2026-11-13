import { useMemo, useState } from "react";
import type { Card, Course } from "../types";
import { dueCards, type Grade } from "../lib/srs";

interface Props {
  course: Course;
  busy: boolean;
  onMakeFromNotes: () => void;
  onMakeMore: (n: number) => void;
  onGrade: (card: Card, grade: Grade) => void;
}

const BOX_LABEL = ["New", "Learning", "Learning", "Getting there", "Good", "Strong", "Mastered"];

export function FlashcardsView({ course, busy, onMakeFromNotes, onMakeMore, onGrade }: Props) {
  const cards = course.cards ?? [];
  const [flipped, setFlipped] = useState(false);
  const [practiceAll, setPracticeAll] = useState(false);
  const [doneNow, setDoneNow] = useState(0);
  const due = useMemo(() => dueCards(course), [course]);
  const queue = practiceAll ? [...cards].sort((a, b) => a.box - b.box || a.due - b.due) : due;
  const card = queue[0];
  const mastered = cards.filter((k) => k.box >= 5).length;
  const defs = course.topics.reduce((n, t) => n + t.definitions.length, 0);

  if (!course.topics.length) {
    return (
      <div className="empty">
        <h2>Flashcards come from your notes</h2>
        <p className="muted">Form your notes first. Every key term becomes a card, and you can make more from any topic.</p>
      </div>
    );
  }

  if (!cards.length) {
    return (
      <div className="empty">
        <h2>Make your flashcards</h2>
        <p className="muted">
          Cards you get wrong come back soon. Cards you know come back days or weeks later, just before you'd forget them. Ten minutes a day is
          enough.
        </p>
        <div className="row-btns">
          {defs > 0 && (
            <button className="btn primary" onClick={onMakeFromNotes}>
              Make {defs} cards from key terms
            </button>
          )}
          <button className="btn" disabled={busy} onClick={() => onMakeMore(20)}>
            Make 20 cards with Claude
          </button>
        </div>
      </div>
    );
  }

  const grade = (g: Grade) => {
    if (!card) return;
    onGrade(card, g);
    setFlipped(false);
    setDoneNow((n) => n + 1);
  };

  return (
    <div className="cards-view">
      <div className="deck-stats">
        <div>
          <span className="ds-num">{due.length}</span>
          <span className="ds-label">due now</span>
        </div>
        <div>
          <span className="ds-num">{cards.length}</span>
          <span className="ds-label">cards</span>
        </div>
        <div>
          <span className="ds-num">{mastered}</span>
          <span className="ds-label">mastered</span>
        </div>
        <div className="deck-actions">
          <button className="btn" disabled={busy} onClick={() => onMakeMore(15)}>
            + 15 more cards
          </button>
        </div>
      </div>

      {card ? (
        <>
          <button className={flipped ? "flash flipped" : "flash"} onClick={() => setFlipped((f) => !f)} aria-label={flipped ? "Show question" : "Show answer"}>
            <span className="flash-inner">
              <span className="flash-face front">
                <span className="flash-topic">{card.topic}</span>
                <span className="flash-text">{card.front}</span>
                <span className="flash-hint">Tap to see the answer</span>
              </span>
              <span className="flash-face back">
                <span className="flash-topic">{card.topic}</span>
                <span className="flash-text">{card.back}</span>
                <span className="flash-hint">{BOX_LABEL[card.box]}</span>
              </span>
            </span>
          </button>
          {flipped ? (
            <div className="grades">
              <button className="grade again" onClick={() => grade("again")}>
                <strong>Again</strong>
                <span>10 min</span>
              </button>
              <button className="grade hard" onClick={() => grade("hard")}>
                <strong>Hard</strong>
                <span>tomorrow</span>
              </button>
              <button className="grade good" onClick={() => grade("good")}>
                <strong>Good</strong>
                <span>a few days</span>
              </button>
              <button className="grade easy" onClick={() => grade("easy")}>
                <strong>Easy</strong>
                <span>a week+</span>
              </button>
            </div>
          ) : (
            <p className="muted small center">
              {queue.length} left{doneNow ? ` · ${doneNow} done this session` : ""}. Say the answer in your head, then tap the card.
            </p>
          )}
        </>
      ) : (
        <div className="empty done">
          <h2>All caught up</h2>
          <p className="muted">No cards are due. Come back tomorrow, or practise anyway.</p>
          <button className="btn" onClick={() => setPracticeAll(true)}>
            Practise all cards
          </button>
        </div>
      )}
    </div>
  );
}
