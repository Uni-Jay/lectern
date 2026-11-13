import { useState } from "react";
import type { Course, Profile, Stats } from "../types";
import { lastDays } from "../lib/dates";
import { courseReport, dayTotal, minutesOf } from "../lib/report";
import { BUDGET } from "../lib/plan";

interface Props {
  profile: Profile;
  courses: Course[];
  stats: Stats;
  streak: number;
  onOpen: (id: string) => void;
}

export function ProgressView({ profile, courses, stats, streak, onOpen }: Props) {
  const [copied, setCopied] = useState("");
  const days = lastDays(7);
  const perDay = days.map((d) => ({ d, s: dayTotal(stats, d), m: minutesOf(dayTotal(stats, d)) }));
  const weekMin = perDay.reduce((n, x) => n + x.m, 0);
  const goal = BUDGET[profile.dailyTime];
  const max = Math.max(goal, ...perDay.map((x) => x.m), 1);
  const week = perDay.reduce(
    (a, x) => ({ ans: a.ans + x.s.mcqAns, right: a.right + x.s.mcqRight, cards: a.cards + x.s.cards, listen: a.listen + x.s.listenSec, mocks: a.mocks + x.s.mocks }),
    { ans: 0, right: 0, cards: 0, listen: 0, mocks: 0 },
  );
  const reports = courses.filter((c) => c.topics.length).map((c) => courseReport(c, stats));

  function summaryText() {
    const lines = [
      `My study week (Lectern)`,
      `${weekMin} minutes studied · ${streak}-day streak`,
      `${week.ans} MCQs (${week.ans ? Math.round((week.right / week.ans) * 100) : 0}% right) · ${week.cards} flashcards · ${Math.round(week.listen / 60)} min listening`,
      ...reports.map((r) => `${r.course.code}: ${r.predicted !== null ? `about ${r.predicted}% if the exam were today` : "not enough practice yet"}${r.weak.length ? ` · revise ${r.weak.join(", ")}` : ""}`),
    ];
    return lines.join("\n");
  }

  return (
    <div className="home">
      <section className="hello report-hero">
        <div className="hello-text">
          <p className="eyebrow">Last 7 days</p>
          <h1>Your study week</h1>
          <p className="hello-sub">
            {weekMin
              ? `${weekMin} minutes in total. Your goal is ${goal} a day, so ${goal * 7} a week.`
              : "Nothing recorded yet this week. Even 15 minutes a day adds up."}
          </p>
        </div>
        <div className="stats">
          <div className="stat">
            <span className="stat-num">{weekMin}</span>
            <span className="stat-label">minutes</span>
          </div>
          <div className="stat">
            <span className="stat-num">{week.ans ? `${Math.round((week.right / week.ans) * 100)}%` : "–"}</span>
            <span className="stat-label">MCQs right ({week.ans})</span>
          </div>
          <div className="stat">
            <span className="stat-num">{streak}</span>
            <span className="stat-label">day streak</span>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2 className="h-small">Minutes per day</h2>
          <span className="muted small">Dashed line: your daily goal ({goal} min)</span>
        </div>
        <div className="week-chart" role="img" aria-label={`Minutes studied each day: ${perDay.map((x) => `${x.m}`).join(", ")}`}>
          <span className="goal-line" style={{ bottom: `${(goal / max) * 100}%` }} />
          {perDay.map((x, i) => (
            <div key={x.d} className="wk-col">
              <span className="wk-val">{x.m || ""}</span>
              <span className={i === 6 ? "wk-bar today" : x.m >= goal ? "wk-bar met" : "wk-bar"} style={{ height: `${(x.m / max) * 100}%` }} />
              <span className="wk-day">{new Date(x.d + "T12:00").toLocaleDateString(undefined, { weekday: "short" })}</span>
            </div>
          ))}
        </div>
        <div className="week-mix muted small">
          <span>{Math.round(week.listen / 60)} min listening</span>
          <span>{week.ans} MCQs</span>
          <span>{week.cards} flashcards</span>
          <span>{week.mocks} mock exams</span>
        </div>
      </section>

      <div className="section-head">
        <h2>If your exam were today</h2>
      </div>
      {reports.length === 0 ? (
        <p className="muted">Form notes for a course and answer some questions to see a prediction.</p>
      ) : (
        <div className="report-grid">
          {reports.map((r) => (
            <button key={r.course.id} className={`card report-card tone-${r.course.color}`} onClick={() => onOpen(r.course.id)}>
              <span className="tile-code">{r.course.code}</span>
              <span className="tile-title">{r.course.title}</span>
              <span className="predict">
                {r.predicted !== null ? (
                  <>
                    <strong>~{r.predicted}%</strong>
                    <span className={r.predicted >= 70 ? "band good" : r.predicted >= 50 ? "band ok" : "band low"}>
                      {r.predicted >= 70 ? "On track" : r.predicted >= 50 ? "Getting there" : "Needs work"}
                    </span>
                  </>
                ) : (
                  <span className="muted small">Answer some MCQs or sit a mock to get a prediction.</span>
                )}
              </span>
              <span className="meters">
                <span>
                  MCQs <b>{r.mcqAcc !== null ? `${Math.round(r.mcqAcc * 100)}%` : "–"}</b>
                </span>
                <span>
                  Mocks <b>{r.mockAvg !== null ? `${Math.round(r.mockAvg * 100)}%` : "–"}</b>
                </span>
                <span>
                  Studied <b>{Math.round(r.coverage * 100)}%</b>
                </span>
              </span>
              {r.weak.length > 0 && <span className="muted small">Revise: {r.weak.join(", ")}</span>}
            </button>
          ))}
        </div>
      )}
      <p className="muted small">A rough guide from your recent MCQ and mock scores and how much of the course you've studied. It isn't a promise.</p>

      <div className="row-btns">
        <button
          className="btn"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(summaryText());
              setCopied("Copied. Paste it in WhatsApp to share with a study partner.");
            } catch {
              setCopied(summaryText());
            }
          }}
        >
          Copy my weekly report
        </button>
      </div>
      {copied && <p className="muted small pre">{copied}</p>}
    </div>
  );
}
