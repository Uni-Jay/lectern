import { useEffect, useState } from "react";
import type { Profile } from "../types";
import { levelLabel } from "../types";
import { config, me, mode, saveWhatsAppReminder, signIn, signOut, signUp, startPayment, type Account, type Config, type SyncStatus } from "../lib/platform";

interface Props {
  profile: Profile;
  sync: SyncStatus;
  courseCount: number;
  onEdit: () => void;
  onSyncNow: () => void;
  onSignedIn: () => void;
  onProfile: (p: Partial<Profile>) => void;
  openAccount: boolean;
  notice?: string;
}

function naira(n: number) {
  return "₦" + n.toLocaleString("en-NG");
}

export function MeView({ profile, sync, courseCount, onEdit, onSyncNow, onSignedIn, onProfile, openAccount, notice }: Props) {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isNew, setIsNew] = useState(true);
  const [msg, setMsg] = useState("");
  const [wa, setWa] = useState(profile.whatsapp);

  useEffect(() => {
    config.then(setCfg);
    if (mode === "server") me().then(setAccount);
  }, []);

  async function auth(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    try {
      const a = isNew ? await signUp(email, password) : await signIn(email, password);
      setAccount(a);
      setPassword("");
      onSignedIn();
    } catch (err) {
      setMsg((err as Error).message);
    }
  }

  const plan = cfg?.plans.find((p) => p.id === (account?.plan ?? "free"));

  return (
    <div className="home me-page">
      <section className="hello">
        <div className="hello-text">
          <p className="eyebrow">My account</p>
          <h1>{profile.fullName}</h1>
          <p className="hello-sub">
            {levelLabel(profile.level)} · {profile.programme} · {profile.institution}, {profile.country}
          </p>
        </div>
      </section>

      <div className="me-grid">
        <section className="card">
          <div className="card-head">
            <h2 className="h-small">My details</h2>
            <button className="btn" onClick={onEdit}>
              Edit
            </button>
          </div>
          <dl className="kv">
            <div>
              <dt>Explanations</dt>
              <dd>
                {{ friend: "Like a friend", simple: "Simple, with key terms", detailed: "Detailed" }[profile.explainStyle]} · {profile.language}
              </dd>
            </div>
            <div>
              <dt>Work</dt>
              <dd>{profile.work === "no" ? "Not working" : `${profile.work === "full-time" ? "Full-time" : "Part-time"}${profile.occupation ? `, ${profile.occupation}` : ""}`}</dd>
            </div>
            <div>
              <dt>Daily study time</dt>
              <dd>{{ "under-30": "Under 30 min", "30-60": "30–60 min", "1-2h": "1–2 hours", "2h-plus": "2+ hours" }[profile.dailyTime]}</dd>
            </div>
            <div>
              <dt>Reminder</dt>
              <dd>{profile.reminderTime || "None"}</dd>
            </div>
          </dl>
        </section>

        <section className="card" id="account">
          <h2 className="h-small">Account and sync</h2>
          {mode === "artifact" ? (
            <>
              <p className="muted small">
                {sync.on
                  ? "You're signed in with your Claude account. Your courses, notes and progress follow you to any device where you open this link."
                  : "Sign in to Claude to keep your notes on every device. For now they're saved on this device."}
              </p>
              {sync.on && (
                <p className="sync-line">
                  <span className={sync.error ? "dot bad" : "dot"} /> {sync.error ? sync.error : sync.at ? `Synced ${new Date(sync.at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}` : "Syncing…"}{" "}
                  <button className="linkish small" onClick={onSyncNow}>
                    Sync now
                  </button>
                </p>
              )}
            </>
          ) : account ? (
            <>
              <p className="muted small">Signed in as {account.email}. Your notes sync to every device you sign in on.</p>
              <p className="sync-line">
                <span className={sync.error ? "dot bad" : "dot"} /> {sync.error ? sync.error : sync.at ? `Synced ${new Date(sync.at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}` : "Syncing…"}{" "}
                <button className="linkish small" onClick={onSyncNow}>
                  Sync now
                </button>
              </p>
              <button
                className="linkish muted small"
                onClick={() => {
                  signOut();
                  setAccount(null);
                }}
              >
                Sign out
              </button>
            </>
          ) : cfg?.accounts ? (
            <form className="auth" onSubmit={auth}>
              <p className="muted small">{openAccount ? "Sign in to use study groups and keep your notes on every device." : "Create a free account to keep your notes on every device."}</p>
              <input id="auth-email" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <input id="auth-pass" type="password" placeholder="Password (8+ characters)" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
              <button className="btn primary">{isNew ? "Create account" : "Sign in"}</button>
              <button type="button" className="linkish small" onClick={() => setIsNew((v) => !v)}>
                {isNew ? "I already have an account" : "Create a new account instead"}
              </button>
              {msg && <p className="warn small">{msg}</p>}
            </form>
          ) : (
            <p className="muted small">Accounts switch on when the app runs on your own server.</p>
          )}
        </section>

        <section className="card">
          <h2 className="h-small">WhatsApp reminders</h2>
          {cfg?.whatsapp && account ? (
            <form
              className="auth"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await saveWhatsAppReminder(wa, profile.reminderTime || "19:30", profile.preferredName);
                  onProfile({ whatsapp: wa });
                  setMsg(`Done. You'll get a WhatsApp message every day at ${profile.reminderTime || "19:30"}.`);
                } catch (err) {
                  setMsg((err as Error).message);
                }
              }}
            >
              <input id="wa-number" type="tel" placeholder="+234 801 234 5678" value={wa} onChange={(e) => setWa(e.target.value)} />
              <button className="btn primary">Send me daily reminders</button>
            </form>
          ) : (
            <p className="muted small">
              {mode === "artifact"
                ? "WhatsApp reminders work when the app is on your own server. On this test link, use “Add to my calendar” on the home page instead."
                : cfg?.whatsapp
                  ? "Sign in above to get WhatsApp reminders."
                  : "Add your WhatsApp Business details to the server to switch these on."}
            </p>
          )}
        </section>

        <section className="card plans-card">
          <h2 className="h-small">Plan</h2>
          {notice && <p className="warn small">{notice}</p>}
          {cfg && (
            <div className="plans">
              {cfg.plans.map((p) => {
                const current = (account?.plan ?? "free") === p.id;
                return (
                  <div key={p.id} className={current ? "plan on" : "plan"}>
                    <strong>{p.name}</strong>
                    <span className="price">{p.price ? naira(p.price) : "Free"}</span>
                    <span className="muted small">{p.price ? "one-time payment · yours for good" : "no card needed"}</span>
                    <ul className="plan-feats small">
                      {p.courses ? (
                        <>
                          <li>Up to {p.courses} courses</li>
                          <li>All study features</li>
                        </>
                      ) : (
                        <>
                          <li>Unlimited courses</li>
                          <li>All study features</li>
                          <li>Every future update</li>
                        </>
                      )}
                    </ul>
                    {current ? (
                      <span className="pill-tag">Your plan</span>
                    ) : p.price && cfg.payments && account ? (
                      <button
                        className="btn primary"
                        onClick={async () => {
                          try {
                            location.href = await startPayment(p.id);
                          } catch (err) {
                            setMsg((err as Error).message);
                          }
                        }}
                      >
                        Pay {naira(p.price)} once
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
          <p className="muted small">
            {mode === "artifact"
              ? `On this test link everything is free and unlimited (you have ${courseCount} course${courseCount === 1 ? "" : "s"}). The ₦2,500 one-time payment switches on when the app runs on your own server with Paystack.`
              : plan && plan.price
                ? "You have full access for good. Thank you!"
                : cfg?.payments
                  ? "Pay once by card, bank transfer or USSD through Paystack. No subscription, nothing to cancel."
                  : "Add your Paystack key to the server to take payments."}
          </p>
          {msg && <p className="muted small">{msg}</p>}
        </section>
      </div>
    </div>
  );
}
