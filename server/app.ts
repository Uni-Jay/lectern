// Lectern API: Claude for notes and questions, accounts and sync, study groups,
// WhatsApp reminders, Paystack payments and MP3 read-aloud.
// Runs as a normal Node server (server/index.ts) or as a Vercel function (api/index.ts).
//
// Every feature switches on only when its keys are set; GET /api/config tells
// the app which ones are on.
import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import Anthropic from "@anthropic-ai/sdk";
import crypto from "node:crypto";
import { kv, persistent, type Challenge, type Group, type Player, type Reminder, type User } from "./store.js";

const app = express();
app.set("trust proxy", true);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 10 } });
const json = express.json({ limit: "4mb" });

const env = process.env;
const MODEL = env.CLAUDE_MODEL ?? "claude-sonnet-5-5";
const claude = env.ANTHROPIC_API_KEY ? new Anthropic() : null;
const TTS_KEY = env.GOOGLE_TTS_API_KEY;
const TTS_VOICE = env.TTS_VOICE ?? "en-GB-Neural2-A";
const WA_TOKEN = env.WHATSAPP_TOKEN;
const WA_PHONE_ID = env.WHATSAPP_PHONE_ID;
const WA_TEMPLATE = env.WHATSAPP_TEMPLATE ?? "study_reminder";
const PAYSTACK = env.PAYSTACK_SECRET_KEY;
const FREE_COURSES = Number(env.FREE_COURSES ?? 2);

// Two plans: free, and a one-time payment that unlocks everything for good.
const PLANS = [
  { id: "free", name: "Free", price: 0, period: "", courses: FREE_COURSES },
  { id: "full", name: "Full access", price: Number(env.PRICE_FULL ?? 2500), period: "one-time", courses: null },
];

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response) =>
    fn(req, res).catch((e) => {
      console.error(e);
      if (!res.headersSent) res.status(500).json({ error: "Something went wrong on the server. Try again." });
    });

app.get("/api/config", (_req, res) =>
  res.json({
    tts: !!TTS_KEY,
    whatsapp: !!(WA_TOKEN && WA_PHONE_ID) && persistent,
    payments: !!PAYSTACK && persistent,
    accounts: persistent,
    ai: !!claude,
    plans: PLANS,
    freeCourses: FREE_COURSES,
  }),
);

// ---------------------------------------------------------------- Claude ---
app.post("/api/generate", upload.array("images"), async (req, res) => {
  if (!claude) return res.status(501).json({ error: "The server has no Claude API key yet (ANTHROPIC_API_KEY)." });
  const prompt = String(req.body?.prompt ?? "");
  if (!prompt) return res.status(400).json({ error: "Missing prompt" });
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  try {
    const content: Anthropic.ContentBlockParam[] = [
      ...files.map((f): Anthropic.ImageBlockParam => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: f.buffer.toString("base64") } })),
      { type: "text", text: prompt },
    ];
    // Stream so long notes don't hit idle timeouts, then return the whole text.
    const stream = claude.messages.stream({ model: MODEL, max_tokens: 16000, messages: [{ role: "user", content }] });
    const msg = await stream.finalMessage();
    res.json({ text: msg.content.map((b) => (b.type === "text" ? b.text : "")).join("") });
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: "Claude request failed" });
  }
});

// -------------------------------------------------------------- accounts ---
const hashPw = (pw: string, salt: string) => crypto.scryptSync(pw, salt, 64).toString("hex");
const publicAccount = (u: User) => ({ email: u.email, plan: u.plan === "free" ? "free" : u.plan, planUntil: null });

async function issue(userId: string) {
  const token = crypto.randomBytes(32).toString("hex");
  await kv.set(`token:${token}`, userId);
  return token;
}

interface Authed extends Request {
  userId: string;
}
const auth = (req: Request, res: Response, next: NextFunction) => {
  if (!persistent) return res.status(501).json({ error: "Accounts aren't switched on for this server yet." });
  const t = (req.headers.authorization ?? "").replace(/^Bearer /, "");
  if (!t) return res.status(401).json({ error: "Please sign in." });
  kv.get<string>(`token:${t}`)
    .then(async (id) => {
      if (!id || !(await kv.get<User>(`user:${id}`))) return res.status(401).json({ error: "Please sign in again." });
      (req as Authed).userId = id;
      next();
    })
    .catch(() => res.status(500).json({ error: "Couldn't check your sign-in." }));
};
const uid = (req: Request) => (req as Authed).userId;

app.post(
  "/api/auth/register",
  json,
  wrap(async (req, res) => {
    if (!persistent) return res.status(501).json({ error: "Accounts aren't switched on for this server yet." });
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
    if (password.length < 8) return res.status(400).json({ error: "Use at least 8 characters for your password." });
    if (await kv.get(`email:${email}`)) return res.status(409).json({ error: "That email already has an account. Sign in instead." });
    const id = crypto.randomUUID();
    const salt = crypto.randomBytes(16).toString("hex");
    const user: User = { id, email, salt, hash: hashPw(password, salt), plan: "free", planUntil: null, createdAt: Date.now() };
    await kv.set(`user:${id}`, user);
    await kv.set(`email:${email}`, id);
    res.json({ token: await issue(id), account: publicAccount(user) });
  }),
);

app.post(
  "/api/auth/login",
  json,
  wrap(async (req, res) => {
    if (!persistent) return res.status(501).json({ error: "Accounts aren't switched on for this server yet." });
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const id = await kv.get<string>(`email:${email}`);
    const u = id ? await kv.get<User>(`user:${id}`) : null;
    const ok = u && crypto.timingSafeEqual(Buffer.from(hashPw(String(req.body?.password ?? ""), u.salt), "hex"), Buffer.from(u.hash, "hex"));
    if (!u || !ok) return res.status(401).json({ error: "Email or password is wrong." });
    res.json({ token: await issue(u.id), account: publicAccount(u) });
  }),
);

app.get("/api/me", auth, wrap(async (req, res) => res.json(publicAccount((await kv.get<User>(`user:${uid(req)}`))!))));

// ------------------------------------------------------------------ sync ---
app.get(
  "/api/sync",
  auth,
  wrap(async (req, res) => res.json((await kv.get(`sync:${uid(req)}`)) ?? { profile: null, courses: [], stats: {}, planDone: {}, deleted: [] })),
);
app.put(
  "/api/sync",
  auth,
  json,
  wrap(async (req, res) => {
    const u = (await kv.get<User>(`user:${uid(req)}`))!;
    const body = req.body as { courses?: unknown[] };
    const limit = u.plan === "free" && PAYSTACK ? FREE_COURSES : Infinity;
    if ((body.courses?.length ?? 0) > limit) body.courses = body.courses!.slice(0, limit);
    await kv.set(`sync:${uid(req)}`, body);
    res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------- groups ---
const newCode = () => Array.from({ length: 6 }, () => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[crypto.randomInt(31)]).join("");
const blankPlayer = (): Player => ({ name: "Student", institution: "", week: "", weekPoints: 0, totalPoints: 0, streak: 0, codes: [] });
const getPlayer = async (id: string) => (await kv.get<Player>(`player:${id}`)) ?? blankPlayer();

async function joinGroup(id: string, code: string) {
  const p = await getPlayer(id);
  p.codes = [...new Set([...p.codes, code])];
  await kv.set(`player:${id}`, p);
  await kv.sadd(`members:${code}`, id);
}

app.post(
  "/api/groups",
  auth,
  json,
  wrap(async (req, res) => {
    let code = newCode();
    while (await kv.get(`group:${code}`)) code = newCode();
    const g: Group = { code, name: String(req.body?.name ?? "Study group").slice(0, 60), createdAt: Date.now(), createdBy: uid(req) };
    await kv.set(`group:${code}`, g);
    await joinGroup(uid(req), code);
    res.json(g);
  }),
);
app.get("/api/groups/mine", auth, wrap(async (req, res) => res.json((await getPlayer(uid(req))).codes)));
app.get(
  "/api/groups/:code",
  auth,
  wrap(async (req, res) => {
    const g = await kv.get<Group>(`group:${req.params.code}`);
    return g ? res.json(g) : res.status(404).json({ error: "No such group" });
  }),
);
app.post(
  "/api/groups/:code/join",
  auth,
  wrap(async (req, res) => {
    const g = await kv.get<Group>(`group:${req.params.code}`);
    if (!g) return res.status(404).json({ error: "No group has that code." });
    await joinGroup(uid(req), g.code);
    res.json(g);
  }),
);
app.post(
  "/api/groups/:code/leave",
  auth,
  wrap(async (req, res) => {
    const p = await getPlayer(uid(req));
    p.codes = p.codes.filter((c) => c !== req.params.code);
    await kv.set(`player:${uid(req)}`, p);
    await kv.srem(`members:${req.params.code}`, uid(req));
    res.json({ ok: true });
  }),
);
app.get(
  "/api/groups/:code/members",
  auth,
  wrap(async (req, res) => {
    const ids = await kv.smembers(`members:${req.params.code}`);
    const out = await Promise.all(
      ids.map(async (id) => {
        const p = await getPlayer(id);
        return { id, name: p.name, institution: p.institution, weekPoints: p.weekPoints, week: p.week, totalPoints: p.totalPoints, streak: p.streak, isMe: id === uid(req) };
      }),
    );
    res.json(out);
  }),
);
app.put(
  "/api/me/points",
  auth,
  json,
  wrap(async (req, res) => {
    const p = await getPlayer(uid(req));
    const b = req.body ?? {};
    Object.assign(p, {
      name: String(b.name ?? p.name).slice(0, 40),
      institution: String(b.institution ?? p.institution).slice(0, 80),
      week: String(b.week ?? ""),
      weekPoints: Math.max(0, Number(b.weekPoints) || 0),
      totalPoints: Math.max(0, Number(b.totalPoints) || 0),
      streak: Math.max(0, Number(b.streak) || 0),
    });
    await kv.set(`player:${uid(req)}`, p);
    res.json({ ok: true });
  }),
);
app.get(
  "/api/groups/:code/challenges",
  auth,
  wrap(async (req, res) => {
    const ids = await kv.smembers(`challenges:${req.params.code}`);
    const list = (await Promise.all(ids.map((id) => kv.get<Challenge>(`challenge:${id}`)))).filter((c): c is Challenge => !!c);
    res.json(list.sort((a, b) => b.createdAt - a.createdAt));
  }),
);
app.post(
  "/api/groups/:code/challenges",
  auth,
  json,
  wrap(async (req, res) => {
    const id = crypto.randomUUID();
    const b = req.body ?? {};
    const c: Challenge = {
      id,
      code: req.params.code,
      title: String(b.title ?? "Challenge"),
      courseCode: String(b.courseCode ?? ""),
      questions: Array.isArray(b.questions) ? b.questions.slice(0, 30) : [],
      byName: String(b.byName ?? ""),
      createdAt: Date.now(),
      by: uid(req),
    };
    await kv.set(`challenge:${id}`, c);
    await kv.sadd(`challenges:${req.params.code}`, id);
    res.json({ id });
  }),
);
type Scores = Record<string, { name: string; score: number; total: number; at: number }>;
app.get(
  "/api/challenges/:id/scores",
  auth,
  wrap(async (req, res) => {
    const s = (await kv.get<Scores>(`scores:${req.params.id}`)) ?? {};
    res.json(Object.entries(s).map(([id, v]) => ({ id, ...v, isMe: id === uid(req) })).sort((a, b) => b.score / b.total - a.score / a.total || a.at - b.at));
  }),
);
app.post(
  "/api/challenges/:id/scores",
  auth,
  json,
  wrap(async (req, res) => {
    const b = req.body ?? {};
    const s = (await kv.get<Scores>(`scores:${req.params.id}`)) ?? {};
    s[uid(req)] = { name: String(b.name ?? "Student").slice(0, 40), score: Number(b.score) || 0, total: Number(b.total) || 0, at: Date.now() };
    await kv.set(`scores:${req.params.id}`, s);
    res.json({ ok: true });
  }),
);

// ------------------------------------------------------- WhatsApp reminders ---
// Uses the WhatsApp Cloud API with an approved template called "study_reminder"
// that has one body variable {{1}} (the student's name).
app.put(
  "/api/reminders",
  auth,
  json,
  wrap(async (req, res) => {
    if (!WA_TOKEN || !WA_PHONE_ID) return res.status(501).json({ error: "WhatsApp reminders aren't set up on this server." });
    const number = String(req.body?.whatsapp ?? "").replace(/[^\d]/g, "");
    if (number.length < 10) return res.status(400).json({ error: "Enter your WhatsApp number with the country code, e.g. +234…" });
    const r: Reminder = { whatsapp: number, time: String(req.body?.time ?? "19:30"), tz: String(req.body?.tz ?? "Africa/Lagos"), name: String(req.body?.name ?? "there"), lastSent: "" };
    await kv.set(`reminder:${uid(req)}`, r);
    await kv.sadd("reminders", uid(req));
    res.json({ ok: true });
  }),
);

async function sendWhatsApp(to: string, name: string) {
  const r = await fetch(`https://graph.facebook.com/v20.0/${WA_PHONE_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${WA_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: { name: WA_TEMPLATE, language: { code: "en" }, components: [{ type: "body", parameters: [{ type: "text", text: name }] }] },
    }),
  });
  if (!r.ok) throw new Error(`WhatsApp ${r.status}: ${await r.text()}`);
}

/** Sends any reminder whose time has come in the last `windowMin` minutes. */
export async function sendDueReminders(windowMin = 1) {
  if (!WA_TOKEN || !WA_PHONE_ID) return 0;
  let sent = 0;
  for (const id of await kv.smembers("reminders")) {
    const r = await kv.get<Reminder>(`reminder:${id}`);
    if (!r) continue;
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: r.tz, hour: "2-digit", minute: "2-digit", year: "numeric", month: "2-digit", day: "2-digit", hour12: false }).formatToParts(new Date());
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const nowMin = Number(get("hour")) * 60 + Number(get("minute"));
    const [h, m] = r.time.split(":").map(Number);
    const due = nowMin - (h * 60 + m);
    const day = `${get("year")}-${get("month")}-${get("day")}`;
    if (due >= 0 && due < windowMin && r.lastSent !== day) {
      r.lastSent = day;
      await kv.set(`reminder:${id}`, r);
      await sendWhatsApp(r.whatsapp, r.name).then(() => sent++, (e) => console.error(e));
    }
  }
  return sent;
}

// For hosts without a long-running process (e.g. Vercel Cron), call this on a schedule.
app.get(
  "/api/cron/reminders",
  wrap(async (req, res) => {
    if (env.CRON_SECRET && req.headers.authorization !== `Bearer ${env.CRON_SECRET}`) return res.sendStatus(401);
    res.json({ sent: await sendDueReminders(Number(req.query.window ?? 60)) });
  }),
);

// --------------------------------------------------------------- Paystack ---
app.post(
  "/api/pay/init",
  auth,
  json,
  wrap(async (req, res) => {
    if (!PAYSTACK) return res.status(501).json({ error: "Payments aren't set up on this server." });
    const plan = PLANS.find((p) => p.id === req.body?.plan && p.price > 0);
    if (!plan) return res.status(400).json({ error: "Unknown plan" });
    const u = (await kv.get<User>(`user:${uid(req)}`))!;
    if (u.plan !== "free") return res.status(400).json({ error: "You already have full access." });
    const reference = `lec_${crypto.randomBytes(10).toString("hex")}`;
    const r = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${PAYSTACK}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: u.email, amount: plan.price * 100, currency: "NGN", reference, callback_url: String(req.body?.callback ?? ""), metadata: { userId: u.id, plan: plan.id } }),
    });
    const data = (await r.json()) as { status: boolean; data?: { authorization_url: string }; message?: string };
    if (!data.status || !data.data) return res.status(502).json({ error: data.message ?? "Paystack error" });
    await kv.set(`payment:${reference}`, { userId: u.id, plan: plan.id, status: "pending", at: Date.now() });
    res.json({ url: data.data.authorization_url });
  }),
);

async function activate(reference: string) {
  const p = await kv.get<{ userId: string; plan: string; status: string }>(`payment:${reference}`);
  if (!p || p.status === "success") return;
  const u = await kv.get<User>(`user:${p.userId}`);
  if (!u) return;
  await kv.set(`payment:${reference}`, { ...p, status: "success" });
  await kv.set(`user:${u.id}`, { ...u, plan: p.plan, planUntil: null });
}

// Paystack calls this after a payment. The signature proves it came from Paystack.
app.post(
  "/api/pay/webhook",
  express.raw({ type: "*/*" }),
  wrap(async (req, res) => {
    if (!PAYSTACK) return res.sendStatus(501);
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {}));
    const sig = crypto.createHmac("sha512", PAYSTACK).update(raw).digest("hex");
    if (sig !== req.headers["x-paystack-signature"]) return res.sendStatus(401);
    const event = JSON.parse(raw.toString("utf8")) as { event: string; data: { reference: string; status: string } };
    if (event.event === "charge.success" && event.data.status === "success") await activate(event.data.reference);
    res.sendStatus(200);
  }),
);

// Also check on return from the payment page, in case the webhook is slow.
app.get(
  "/api/pay/verify/:reference",
  auth,
  wrap(async (req, res) => {
    if (!PAYSTACK) return res.status(501).json({ error: "Payments aren't set up." });
    const r = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(req.params.reference)}`, { headers: { Authorization: `Bearer ${PAYSTACK}` } });
    const data = (await r.json()) as { data?: { status: string } };
    if (data.data?.status === "success") await activate(req.params.reference);
    res.json(publicAccount((await kv.get<User>(`user:${uid(req)}`))!));
  }),
);

// ------------------------------------------------------ Read-aloud as MP3 ---
const ttsCache = new Map<string, Buffer>();
async function synthesize(text: string): Promise<Buffer> {
  const r = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${TTS_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: TTS_VOICE.split("-").slice(0, 2).join("-"), name: TTS_VOICE },
      audioConfig: { audioEncoding: "MP3", speakingRate: 1.0 },
    }),
  });
  if (!r.ok) throw new Error(`TTS ${r.status}`);
  const { audioContent } = (await r.json()) as { audioContent: string };
  return Buffer.from(audioContent, "base64");
}
async function tts(text: string, res: Response) {
  if (!TTS_KEY) return res.status(501).json({ error: "Read-aloud audio is not set up" });
  if (!text.trim()) return res.status(400).json({ error: "Missing text" });
  try {
    let mp3 = ttsCache.get(text);
    if (!mp3) {
      mp3 = await synthesize(text);
      if (ttsCache.size > 500) ttsCache.clear();
      ttsCache.set(text, mp3);
    }
    res.type("audio/mpeg").set("Cache-Control", "public, max-age=2592000, immutable").send(mp3);
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: "Audio request failed" });
  }
}
app.get("/api/tts/status", (_req, res) => res.json({ enabled: !!TTS_KEY }));
app.get("/api/tts", (req, res) => tts(String(req.query.t ?? "").slice(0, 3000), res));
app.post("/api/tts", express.json({ limit: "64kb" }), (req, res) => tts(String(req.body?.text ?? "").slice(0, 3000), res));

app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

export default app;
