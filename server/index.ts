// Run Lectern as a normal Node server (Render, Railway, a VPS, or your laptop).
//   cp .env.example .env   # fill in the keys you have
//   npm run build && npm run server
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import app, { sendDueReminders } from "./app.js";

// Serve the built web app from the same server.
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
app.use(express.static(dist));
app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));

// A long-running server can check WhatsApp reminders every minute.
setInterval(() => sendDueReminders(1).catch((e) => console.error(e)), 60_000);

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => console.log(`Lectern on http://localhost:${port}`));
