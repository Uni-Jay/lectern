import { useEffect, useState } from "react";
import type { Course, Profile } from "../types";
import { groups, mode, type Challenge, type GroupMeta, type Member, type Score } from "../lib/platform";

interface Props {
  profile: Profile;
  courses: Course[];
  onSignIn: () => void;
}

const LETTERS = ["A", "B", "C", "D", "E"];

function ChallengeCard({ ch, profile, onDone }: { ch: Challenge; profile: Profile; onDone: () => void }) {
  const [scores, setScores] = useState<Score[]>([]);
  const [playing, setPlaying] = useState(false);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const mine = scores.find((s) => s.isMe);
  useEffect(() => groups.watchScores(ch.id, setScores), [ch.id]);
  const all = Object.keys(answers).length === ch.questions.length;
  const right = ch.questions.filter((q, i) => answers[i] === q.answer).length;

  return (
    <li className="card challenge">
      <div className="card-head">
        <div>
          <span className="tile-code">{ch.courseCode}</span>
          <h3 className="h-small">{ch.title}</h3>
          <p className="muted small">
            {ch.questions.length} questions · set by {ch.byName} · {new Date(ch.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
          </p>
        </div>
        {mine ? (
          <span className="pct good">
            {mine.score}/{mine.total}
          </span>
        ) : (
          !playing && (
            <button className="btn primary" onClick={() => setPlaying(true)}>
              Take it
            </button>
          )
        )}
      </div>

      {playing && !mine && (
        <ol className="qlist">
          {ch.questions.map((q, i) => (
            <li key={i} className="q">
              <p className="qtext">
                <span className="qnum">{i + 1}.</span> {q.q}
              </p>
              <div className="opts">
                {q.options.map((o, j) => (
                  <button key={j} className={`opt ${answers[i] === j ? "picked" : ""}`} onClick={() => setAnswers((a) => ({ ...a, [i]: j }))}>
                    <span className="letter">{LETTERS[j]}</span>
                    <span>{o}</span>
                  </button>
                ))}
              </div>
            </li>
          ))}
          <button
            className="btn primary"
            disabled={!all}
            onClick={async () => {
              await groups.submitScore(ch.id, profile.preferredName, right, ch.questions.length);
              setPlaying(false);
              onDone();
            }}
          >
            {all ? "Submit answers" : `Answer all ${ch.questions.length} to submit`}
          </button>
        </ol>
      )}

      {scores.length > 0 && (
        <ol className="board small-board">
          {scores.map((s, i) => (
            <li key={s.id} className={s.isMe ? "me-row" : ""}>
              <span className="rank">{i + 1}</span>
              <span className="who">{s.isMe ? `${s.name} (you)` : s.name}</span>
              <span className="pts">
                {s.score}/{s.total}
              </span>
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}

function GroupPanel({ code, profile, courses, onLeave }: { code: string; profile: Profile; courses: Course[]; onLeave: () => void }) {
  const [meta, setMeta] = useState<GroupMeta | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [setting, setSetting] = useState(false);
  const [msg, setMsg] = useState("");
  const withQs = courses.filter((c) => c.mcq.length >= 5);
  const [courseId, setCourseId] = useState(withQs[0]?.id ?? "");

  useEffect(() => {
    groups.meta(code).then(setMeta);
    const a = groups.watchMembers(code, (m) => setMembers([...m].sort((x, y) => y.weekPoints - x.weekPoints || y.totalPoints - x.totalPoints)));
    const b = groups.watchChallenges(code, setChallenges);
    return () => {
      a();
      b();
    };
  }, [code]);

  async function post() {
    const c = courses.find((x) => x.id === courseId);
    if (!c) return;
    const qs = [...c.mcq].sort(() => Math.random() - 0.5).slice(0, 10);
    await groups.postChallenge({ code, title: `${c.title}: ${qs.length}-question challenge`, courseCode: c.code, questions: qs, byName: profile.preferredName });
    setSetting(false);
    setMsg("Challenge posted. Your group can take it now.");
  }

  return (
    <section className="group">
      <div className="group-head">
        <div>
          <h2>{meta?.name ?? "Study group"}</h2>
          <p className="muted small">
            Invite code{" "}
            <button
              className="code-chip"
              onClick={() => navigator.clipboard?.writeText(code).then(() => setMsg("Code copied. Send it to your classmates."), () => setMsg(`Your code is ${code}`))}
            >
              {code}
            </button>{" "}
            · {members.length} member{members.length === 1 ? "" : "s"}
          </p>
        </div>
        <button className="linkish muted small" onClick={onLeave}>
          Leave group
        </button>
      </div>
      {msg && <p className="muted small">{msg}</p>}

      <div className="group-grid">
        <div className="card">
          <h3 className="h-small">This week's leaderboard</h3>
          <p className="muted small">Points: 2 per correct MCQ, 1 per flashcard, 1 per minute listening, 20 per mock exam.</p>
          <ol className="board">
            {members.map((m, i) => (
              <li key={m.id} className={m.isMe ? "me-row" : ""}>
                <span className={`rank r${i + 1}`}>{i + 1}</span>
                <span className="who">
                  {m.isMe ? `${m.name} (you)` : m.name}
                  {m.institution && <span className="muted small"> · {m.institution}</span>}
                </span>
                <span className="streak-mini">{m.streak > 0 ? `${m.streak}🔥` : ""}</span>
                <span className="pts">{m.weekPoints}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="card">
          <div className="card-head">
            <h3 className="h-small">Challenges</h3>
            {!setting && (
              <button className="btn" disabled={!withQs.length} onClick={() => setSetting(true)}>
                + Set a challenge
              </button>
            )}
          </div>
          {!withQs.length && <p className="muted small">Set some MCQs in one of your courses first, then challenge your group with them.</p>}
          {setting && (
            <div className="set-challenge">
              <select id="challenge-course" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                {withQs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.title}
                  </option>
                ))}
              </select>
              <button className="btn primary" onClick={post}>
                Post 10 questions
              </button>
              <button className="btn ghost" onClick={() => setSetting(false)}>
                Cancel
              </button>
            </div>
          )}
          {challenges.length === 0 && !setting && <p className="muted small">No challenges yet.</p>}
        </div>
      </div>

      {challenges.length > 0 && (
        <ul className="challenges">
          {challenges.map((ch) => (
            <ChallengeCard key={ch.id} ch={ch} profile={profile} onDone={() => setMsg("Score submitted.")} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function GroupsView({ profile, courses, onSignIn }: Props) {
  const [ok, setOk] = useState<boolean | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [join, setJoin] = useState("");
  const [err, setErr] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    groups.available().then((a) => {
      setOk(a);
      if (a)
        groups.myCodes().then((c) => {
          setCodes(c);
          setCurrent(c[0] ?? null);
        });
    });
  }, []);

  if (ok === null) return <div className="home"><p className="muted">Loading groups…</p></div>;

  if (!ok) {
    return (
      <div className="home">
        <div className="empty">
          <h2>Study groups need an account</h2>
          <p className="muted">
            {mode === "artifact"
              ? "Groups use your Claude sign-in. Open this page while signed in to Claude."
              : "Create a free account so your classmates can find you and you can keep your scores."}
          </p>
          {mode === "server" && (
            <button className="btn primary" onClick={onSignIn}>
              Sign in or create an account
            </button>
          )}
        </div>
      </div>
    );
  }

  async function run(fn: () => Promise<void>) {
    setErr("");
    setWorking(true);
    try {
      await fn();
    } catch (e) {
      setErr((e as Error).message || "Something went wrong. Try again.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="home">
      <section className="hello groups-hero">
        <div className="hello-text">
          <p className="eyebrow">Study groups</p>
          <h1>Study with your classmates</h1>
          <p className="hello-sub">Make a group, share the code on WhatsApp, and push each other up the weekly leaderboard.</p>
        </div>
      </section>

      <div className="group-tabs">
        {codes.map((c) => (
          <button key={c} className={c === current ? "choice on" : "choice"} onClick={() => setCurrent(c)}>
            {c}
          </button>
        ))}
      </div>

      <div className="group-forms">
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            run(async () => {
              const g = await groups.create(name);
              setCodes((c) => [...new Set([...c, g.code])]);
              setCurrent(g.code);
              setName("");
            });
          }}
        >
          <h3 className="h-small">Start a group</h3>
          <div className="inline-form">
            <input id="group-name" placeholder="e.g. CSC 200L night crew" value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn primary" disabled={working || !name.trim()}>
              Create
            </button>
          </div>
        </form>
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            if (!join.trim()) return;
            run(async () => {
              const g = await groups.join(join);
              if (!g) throw new Error("No group has that code. Check it and try again.");
              setCodes((c) => [...new Set([...c, g.code])]);
              setCurrent(g.code);
              setJoin("");
            });
          }}
        >
          <h3 className="h-small">Join with a code</h3>
          <div className="inline-form">
            <input id="group-code" placeholder="6-letter code" value={join} onChange={(e) => setJoin(e.target.value.toUpperCase())} maxLength={6} />
            <button className="btn" disabled={working || join.trim().length < 6}>
              Join
            </button>
          </div>
        </form>
      </div>
      {err && <p className="job error">{err}</p>}
      {mode === "artifact" && <p className="muted small">On this test link, only people you've shared the page with can join your group.</p>}

      {current && (
        <GroupPanel
          key={current}
          code={current}
          profile={profile}
          courses={courses}
          onLeave={() =>
            run(async () => {
              await groups.leave(current);
              const rest = codes.filter((c) => c !== current);
              setCodes(rest);
              setCurrent(rest[0] ?? null);
            })
          }
        />
      )}
    </div>
  );
}
