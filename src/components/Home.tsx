import type { Course, Profile } from "../types";
import { levelShort } from "../types";
import type { PlanTask } from "../lib/plan";
import { BUDGET, orderCourses } from "../lib/plan";
import { daysUntil } from "../lib/dates";
import { dueCards } from "../lib/srs";

interface Props {
  profile: Profile;
  courses: Course[];
  tasks: PlanTask[];
  isDone: (t: PlanTask) => boolean;
  streak: number;
  todayMinutes: number;
  reminderMsg: string;
  onOpen: (id: string) => void;
  onNew: () => void;
  onTask: (t: PlanTask) => void;
  onTick: (t: PlanTask) => void;
  onRefreshPlan: () => void;
  onReminder: () => void;
  onEditProfile: () => void;
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const KIND_ICON: Record<PlanTask["kind"], string> = {
  "add-notes": "＋",
  listen: "▶",
  cards: "▣",
  mcq: "✓",
  summary: "≡",
  mock: "⏱",
  weak: "↺",
  "exam-date": "◷",
};

export function Home(p: Props) {
  const { profile, courses, tasks } = p;
  const done = tasks.filter(p.isDone).length;
  const planMin = tasks.reduce((n, t) => n + t.minutes, 0);
  const budget = BUDGET[profile.dailyTime];
  const exams = orderCourses(courses)
    .map((c) => ({ c, d: daysUntil(c.examDate) }))
    .filter((x) => x.d !== null && x.d >= 0);

  return (
    <div className="home">
      <section className="hello">
        <div className="hello-text">
          <p className="eyebrow">
            {profile.institution} · {profile.programme}
          </p>
          <h1>
            {greeting()}, {profile.preferredName}.
          </h1>
          <p className="hello-sub">
            {courses.length
              ? done === tasks.length && tasks.length
                ? "Today's plan is done. Well done. Anything more is a bonus."
                : `Your plan for today takes about ${planMin} minutes, within the ${budget} you said you have.`
              : "Create your first course, attach your notes, and Lectern will read them for you."}
          </p>
        </div>
        <div className="stats">
          <div className="stat streak">
            <span className="stat-num">
              {p.streak}
              <span className="flame" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22">
                  <path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3-1-3 0-6 1-9z" fill="currentColor" />
                </svg>
              </span>
            </span>
            <span className="stat-label">day streak</span>
          </div>
          <div className="stat">
            <span className="stat-num">{p.todayMinutes}</span>
            <span className="stat-label">min studied today</span>
          </div>
          <div className="stat">
            <span className="stat-num">
              {done}/{tasks.length}
            </span>
            <span className="stat-label">plan done</span>
          </div>
        </div>
      </section>

      {courses.length > 0 && (
        <div className="home-grid">
          <section className="card today">
            <div className="card-head">
              <h2>Today's plan</h2>
              <button className="linkish small" onClick={p.onRefreshPlan}>
                Refresh
              </button>
            </div>
            {tasks.length === 0 ? (
              <p className="muted">Nothing planned. Add notes to a course to get started.</p>
            ) : (
              <ol className="tasks">
                {tasks.map((t) => {
                  const ok = p.isDone(t);
                  const c = courses.find((x) => x.id === t.courseId);
                  return (
                    <li key={t.id} className={`task tone-${c?.color ?? 0}${ok ? " done" : ""}`}>
                      <button className="tick" aria-label={ok ? `Done: ${t.title}` : `Mark done: ${t.title}`} aria-pressed={ok} onClick={() => p.onTick(t)}>
                        {ok ? "✓" : ""}
                      </button>
                      <button className="task-body" onClick={() => p.onTask(t)}>
                        <span className="task-icon" aria-hidden="true">
                          {KIND_ICON[t.kind]}
                        </span>
                        <span className="task-text">
                          <span className="task-title">{t.title}</span>
                          <span className="task-detail">{t.detail}</span>
                        </span>
                        <span className="task-min">{t.minutes} min</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <aside className="home-side">
            <section className="card">
              <h2 className="h-small">Exam countdown</h2>
              {exams.length ? (
                <ul className="exams">
                  {exams.map(({ c, d }) => (
                    <li key={c.id} className={`tone-${c.color}`}>
                      <button onClick={() => p.onOpen(c.id)}>
                        <span className={d! <= 7 ? "days hot" : "days"}>
                          <strong>{d}</strong>
                          <span>{d === 1 ? "day" : "days"}</span>
                        </span>
                        <span className="exam-text">
                          <span className="tile-code">{c.code}</span>
                          <span className="exam-title">{c.title}</span>
                          {d! <= 7 && <span className="rev">Revision mode</span>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted small">Add exam dates on each course page. Your plan switches to revision in the final week.</p>
              )}
            </section>

            <section className="card">
              <h2 className="h-small">Daily reminder</h2>
              {profile.reminderTime ? (
                <>
                  <p className="muted small">Every day at {profile.reminderTime}. Add it to your phone's calendar so it rings even when Lectern is closed.</p>
                  <div className="row-btns">
                    <button className="btn" onClick={p.onReminder}>
                      Add to my calendar
                    </button>
                    <button className="linkish small" onClick={p.onEditProfile}>
                      Change time
                    </button>
                  </div>
                </>
              ) : (
                <button className="btn" onClick={p.onEditProfile}>
                  Set a reminder time
                </button>
              )}
              {p.reminderMsg && <p className="muted small">{p.reminderMsg}</p>}
            </section>
          </aside>
        </div>
      )}

      <div className="section-head">
        <h2>My courses</h2>
        {courses.length > 0 && (
          <button className="btn primary" onClick={p.onNew}>
            + New course
          </button>
        )}
      </div>

      {courses.length === 0 ? (
        <button className="first-course" onClick={p.onNew}>
          <span className="fc-plus" aria-hidden="true">
            +
          </span>
          <span className="fc-title">Create your first course</span>
          <span className="fc-sub">e.g. ACC 201 · Principles of Accounting. Attach its notes as you create it.</span>
        </button>
      ) : (
        <div className="course-grid">
          {courses.map((c) => {
            const d = daysUntil(c.examDate);
            const due = dueCards(c).length;
            const pct = c.topics.length ? Math.round(((c.studied?.length ?? 0) / c.topics.length) * 100) : 0;
            const status = c.topics.length
              ? `${c.topics.length} topics · ${pct}% studied${due ? ` · ${due} cards due` : ""}`
              : c.sources.length
                ? `${c.sources.length} file${c.sources.length === 1 ? "" : "s"} added · not read yet`
                : "No files yet";
            return (
              <button key={c.id} className={`course-tile tone-${c.color}`} onClick={() => p.onOpen(c.id)}>
                <span className="spine" aria-hidden="true" />
                <span className="tile-body">
                  <span className="tile-top">
                    <span className="tile-code">{c.code}</span>
                    <span className="tile-level">{levelShort(c.level)}</span>
                  </span>
                  <span className="tile-title">{c.title}</span>
                  {d !== null && d >= 0 && <span className="tile-exam">Exam in {d} day{d === 1 ? "" : "s"}</span>}
                  <span className="tile-progress" aria-hidden="true">
                    <span style={{ width: `${pct}%` }} />
                  </span>
                  <span className="tile-status">{status}</span>
                </span>
              </button>
            );
          })}
          <button className="course-tile add" onClick={p.onNew}>
            <span className="tile-body">
              <span className="fc-plus small" aria-hidden="true">
                +
              </span>
              <span className="tile-title">Add a course</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
