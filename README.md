# Lectern: reads your notes for you

A study app for working students. Upload a course's files (or a whole folder) and Lectern:

- **Reads every page** (PDF, Word, PowerPoint, text, photos of handwritten notes) and forms full notes
- **Explains each topic in simple words**, with examples from the student's own life and job, in their language
- **Reads aloud** (full notes, simple words or summary), keeps playing across the app and resumes where it stopped
- **Plans each day** from the time the student has and their exam dates; switches to revision mode in the last week; tracks a streak
- **Flashcards** with spaced repetition (key terms become cards automatically)
- **Ask my notes**: chat answered from the notes with topic citations; voice input
- **MCQ, theory and practical questions** at the student's level, plus **timed mock exams** marked by Claude
- **Past questions**: upload old papers, see which topics come up most, practise in the same style
- **Weekly progress report** with a predicted score per course
- **Study groups**: invite code, weekly leaderboard, MCQ challenges
- **Accounts and sync**, **WhatsApp reminders**, **Paystack payments**, **offline mode** (self-hosted)

## Stack

- React 18 + TypeScript + Vite
- `pdfjs-dist` (PDF text and scanned-page images), `mammoth` (Word), `jszip` (PowerPoint)
- Claude for notes, summaries, questions and reading photos
- Express API server (`server/index.ts`) that keeps your Claude API key on the server

## Run it locally

```bash
npm install
cp .env.example .env              # put your ANTHROPIC_API_KEY in it
npm run server                    # API on http://localhost:8787
npm run dev                       # app on http://localhost:5173 (forwards /api to the server)
```

## Read-aloud in the background

The player is app-wide: it keeps reading while the student moves between tabs, courses and the
home screen, with a small player bar at the bottom, until they pause or stop it.

- **On your own server with `GOOGLE_TTS_API_KEY` set**, lines are turned into MP3 audio
  (`/api/tts`) and played as real media. It keeps playing with the screen locked or in another
  app, shows lock-screen controls (play, pause, next and previous topic), and the phone pauses it
  automatically for calls. Press play to carry on after the call.
- **Without it**, the browser's own voice is used. It keeps reading inside the app, but most
  phones stop browser speech when the screen locks. "Keep screen on while listening" helps.
- **As a Claude artifact**, the Claude voice is used. It pauses when the app goes to the background
  and carries on by itself when the student comes back.

## Server features and their keys (.env)

| Feature | Needs |
|---|---|
| Notes, explanations, questions, chat, marking | `ANTHROPIC_API_KEY` |
| Accounts, sync, study groups | nothing extra (data in `data/db.json`; set `DATA_FILE` to a persistent disk) |
| Read-aloud as MP3 (locked screen, offline audio) | `GOOGLE_TTS_API_KEY`, optional `TTS_VOICE` |
| WhatsApp reminders | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, an approved template (`WHATSAPP_TEMPLATE`, default `study_reminder`, one variable for the name) |
| Payments | `PAYSTACK_SECRET_KEY`; set the webhook URL in Paystack to `https://your-domain/api/pay/webhook`. Plans: free (`FREE_COURSES`, default 2) and a one-time payment for full access forever (`PRICE_FULL`, default ₦2,500) |

Offline mode (the app and saved audio work without data) switches on automatically over HTTPS.

## On the Claude test link

The same build runs as a Claude artifact (`npm run artifact`, then publish `dist/`). There, Claude
calls use the student's Claude account, sign-in and sync use their Claude account, and study groups
are shared with whoever the page is shared with. Reminders are a calendar file instead of WhatsApp,
and payments, MP3 audio and offline mode need your own server.

## Deploy

```bash
npm run build
ANTHROPIC_API_KEY=... npm run server   # serves dist/ and /api from one process
```

Any Node host works (Render, Railway, a VPS). Set `ANTHROPIC_API_KEY`, and optionally `CLAUDE_MODEL` and `PORT`.

## Project layout

```
src/
  App.tsx                 state, the read → notes → summary pipeline, question generation
  types.ts                Course, Topic, Mcq, TheoryQ, PracticalTask
  lib/extract.ts          file readers (loaded only when a file is added, to save data)
  lib/files.ts            folder drag-and-drop, splitting long text into parts
  lib/prompts.ts          every prompt, and how each level (100–400) shapes questions
  lib/ai.ts               talks to Claude: artifact runtime or /api/generate
  lib/speech.ts           read-aloud (Claude voice in the artifact, browser voice elsewhere)
  lib/storage.ts          saves courses on the device (localStorage)
  components/             Header, Sidebar, NotesView, SummaryView, ListenView, McqView, TheoryView, PracticalView
server/index.ts           POST /api/generate → Claude API
scripts/artifact-page.mjs prepares dist/ for publishing as a Claude artifact
```

## How "read everything" works

Long material is split into parts of about 12,000 characters at paragraph breaks. Each part is sent
to Claude with an instruction to cover every concept, definition, list, formula and example in order.
Topics that run across two parts are merged. So a 200-page PDF is fully read, not skimmed.

## Next steps

- Accounts and cloud sync (e.g. Supabase) so notes follow you across phone and laptop
- Download audio as MP3 for offline listening (server-side text-to-speech)
- Timed mock exams and a daily 15-minute study plan built from weak topics
- Store uploaded files in object storage instead of on the device
