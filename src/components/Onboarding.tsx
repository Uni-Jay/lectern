import { useState } from "react";
import type { Level, Profile } from "../types";
import { LANGUAGES, LEVELS } from "../types";

interface Props {
  initial: Profile | null;
  onSave: (p: Profile) => void;
  onCancel?: () => void;
}

const COUNTRIES = ["Nigeria", "Ghana", "Kenya", "South Africa", "Uganda", "Cameroon", "Rwanda", "United Kingdom", "United States", "Canada", "India"];
const LEARN = ["Listening", "Reading short notes", "Practice questions", "Real-life examples", "Diagrams and steps"];

const blank: Profile = {
  fullName: "",
  preferredName: "",
  country: "",
  institution: "",
  programme: "",
  level: 100,
  studyMode: "distance",
  work: "full-time",
  occupation: "",
  dailyTime: "30-60",
  learnBy: ["Listening", "Real-life examples"],
  explainStyle: "friend",
  language: "English",
  reminderTime: "19:30",
  whatsapp: "",
  createdAt: 0,
};

const STEPS = ["About you", "Your studies", "How you learn"];

export function Onboarding({ initial, onSave, onCancel }: Props) {
  const [p, setP] = useState<Profile>(initial ?? blank);
  const [step, setStep] = useState(0);
  const editing = !!initial;
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP((x) => ({ ...x, [k]: v }));

  const valid = [
    p.fullName.trim().length > 1 && p.country.trim().length > 1,
    p.institution.trim().length > 1 && p.programme.trim().length > 1,
    true,
  ];

  function next(e: React.FormEvent) {
    e.preventDefault();
    if (!valid[step]) return;
    if (step < 2) setStep(step + 1);
    else
      onSave({
        ...p,
        fullName: p.fullName.trim(),
        preferredName: p.preferredName.trim() || p.fullName.trim().split(/\s+/)[0],
        createdAt: p.createdAt || Date.now(),
      });
  }

  return (
    <div className="onboard">
      <aside className="onboard-art" aria-hidden="true">
        <div className="art-inner">
          <img className="art-logo" src={LOGO} alt="" />
          <p className="art-word">
            <span className="L">L</span>ectern
          </p>
          <p className="art-tag">
            Study Smarter. <span>Achieve More.</span>
          </p>
          <p className="art-sub">Upload your course materials. Get clear notes, simple explanations, audio for the road, and exam practice at your level.</p>
          <ul className="art-list">
            <li><span>01</span>Every page read, nothing skipped</li>
            <li><span>02</span>Explained in simple words, with examples from your life</li>
            <li><span>03</span>Listen on the go, practise before exams</li>
          </ul>
          <p className="art-pills">
            STUDY<b>•</b>LEARN<b>•</b>SUCCEED
          </p>
        </div>
      </aside>

      <main className="onboard-form">
        <form onSubmit={next} className="ob-card">
          <div className="ob-steps" aria-label={`Step ${step + 1} of 3`}>
            {STEPS.map((s, i) => (
              <button
                type="button"
                key={s}
                className={i === step ? "ob-step on" : i < step ? "ob-step done" : "ob-step"}
                onClick={() => (i < step || (editing && valid.slice(0, i).every(Boolean))) && setStep(i)}
              >
                <span className="ob-dot">{i < step ? "✓" : i + 1}</span>
                <span className="ob-label">{s}</span>
              </button>
            ))}
          </div>

          {step === 0 && (
            <div className="ob-body">
              <h2>{editing ? "Your details" : "Welcome! Let's get to know you"}</h2>
              <p className="muted">This helps Lectern explain things in a way that fits your life. It stays on this device.</p>
              <label>
                Full name
                <input id="pf-name" autoFocus value={p.fullName} onChange={(e) => set("fullName", e.target.value)} placeholder="e.g. Gbemisola Adura" required />
              </label>
              <label>
                <span>
                  What should we call you? <span className="opt-tag">optional</span>
                </span>
                <input id="pf-pref" value={p.preferredName} onChange={(e) => set("preferredName", e.target.value)} placeholder="e.g. Gbemi" />
              </label>
              <label>
                Country
                <input id="pf-country" list="countries" value={p.country} onChange={(e) => set("country", e.target.value)} placeholder="Start typing your country" required />
                <datalist id="countries">
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </label>
            </div>
          )}

          {step === 1 && (
            <div className="ob-body">
              <h2>What are you studying?</h2>
              <p className="muted">Any school, college or university.</p>
              <label>
                School / institution
                <input id="pf-inst" autoFocus value={p.institution} onChange={(e) => set("institution", e.target.value)} placeholder="e.g. University of Lagos" required />
              </label>
              <label>
                Programme
                <input id="pf-prog" value={p.programme} onChange={(e) => set("programme", e.target.value)} placeholder="e.g. BSc Accounting" required />
              </label>
              <div className="field">
                <span className="field-label">Current level</span>
                <div className="choice-row">
                  {LEVELS.map((l) => (
                    <button type="button" key={l.value} className={p.level === l.value ? "choice on" : "choice"} onClick={() => set("level", l.value as Level)}>
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field">
                <span className="field-label">How do you study?</span>
                <div className="choice-row">
                  {([
                    ["full-time", "Full-time"],
                    ["part-time", "Part-time"],
                    ["distance", "Online / distance"],
                  ] as const).map(([v, l]) => (
                    <button type="button" key={v} className={p.studyMode === v ? "choice on" : "choice"} onClick={() => set("studyMode", v)}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="ob-body">
              <h2>Your life and how you learn</h2>
              <p className="muted">So examples come from things you already know.</p>
              <div className="field">
                <span className="field-label">Do you work?</span>
                <div className="choice-row">
                  {([
                    ["full-time", "Yes, full-time"],
                    ["part-time", "Yes, part-time"],
                    ["no", "Not at the moment"],
                  ] as const).map(([v, l]) => (
                    <button type="button" key={v} className={p.work === v ? "choice on" : "choice"} onClick={() => set("work", v)}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              {p.work !== "no" && (
                <label>
                  <span>
                    What do you do? <span className="opt-tag">optional</span>
                  </span>
                  <input id="pf-job" value={p.occupation} onChange={(e) => set("occupation", e.target.value)} placeholder="e.g. Customer service at a bank" />
                </label>
              )}
              <div className="field">
                <span className="field-label">Time you can study each day</span>
                <div className="choice-row">
                  {([
                    ["under-30", "Under 30 min"],
                    ["30-60", "30–60 min"],
                    ["1-2h", "1–2 hours"],
                    ["2h-plus", "2+ hours"],
                  ] as const).map(([v, l]) => (
                    <button type="button" key={v} className={p.dailyTime === v ? "choice on" : "choice"} onClick={() => set("dailyTime", v)}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field">
                <span className="field-label">You learn best by <span className="opt-tag">pick any</span></span>
                <div className="choice-row">
                  {LEARN.map((l) => {
                    const on = p.learnBy.includes(l);
                    return (
                      <button
                        type="button"
                        key={l}
                        aria-pressed={on}
                        className={on ? "choice on" : "choice"}
                        onClick={() => set("learnBy", on ? p.learnBy.filter((x) => x !== l) : [...p.learnBy, l])}
                      >
                        {l}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="field">
                <span className="field-label">How should we explain things?</span>
                <div className="style-cards">
                  {([
                    ["friend", "Like a friend", "Very simple. No big grammar."],
                    ["simple", "Simple, with key terms", "Plain words, but keeps the terms you'll see in exams."],
                    ["detailed", "Detailed", "Clear, with the reasoning behind each idea."],
                  ] as const).map(([v, t, d]) => (
                    <button type="button" key={v} className={p.explainStyle === v ? "style-card on" : "style-card"} onClick={() => set("explainStyle", v)}>
                      <strong>{t}</strong>
                      <span>{d}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="ob-body ob-extra">
              <div className="row2">
                <label>
                  Explain things in
                  <select id="pf-lang" value={p.language} onChange={(e) => set("language", e.target.value)}>
                    {LANGUAGES.map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Daily study reminder
                  <input id="pf-time" type="time" value={p.reminderTime} onChange={(e) => set("reminderTime", e.target.value)} />
                </label>
              </div>
              <p className="muted small">Exam words stay in English, so you still know them in the exam hall.</p>
            </div>
          )}

          <div className="ob-actions">
            {step > 0 ? (
              <button type="button" className="btn ghost" onClick={() => setStep(step - 1)}>
                Back
              </button>
            ) : editing && onCancel ? (
              <button type="button" className="btn ghost" onClick={onCancel}>
                Cancel
              </button>
            ) : (
              <span />
            )}
            <button type="submit" className="btn primary big" disabled={!valid[step]}>
              {step < 2 ? "Continue" : editing ? "Save my details" : "Start studying"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

// The Lectern logo (in public/brand), resolved against the app's base path.
export const LOGO = `${import.meta.env.BASE_URL}brand/mark.png`;
export const LOGO_SMALL = `${import.meta.env.BASE_URL}brand/mark-small.png`;
