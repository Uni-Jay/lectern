// Prepares dist/ for publishing as a Claude artifact:
// 1. escapes raw control bytes in JS (they're all inside string literals in the minified pdf.js worker)
// 2. writes dist/artifact.html (page content without the html/head/body wrapper).
import fs from "node:fs";
import path from "node:path";

const dir = "dist/assets";
for (const f of fs.readdirSync(dir).filter((f) => /\.(m?js)$/.test(f))) {
  const p = path.join(dir, f);
  const s = fs.readFileSync(p, "utf8");
  const out = s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, (c) => "\\x" + c.charCodeAt(0).toString(16).padStart(2, "0"));
  if (out !== s) fs.writeFileSync(p, out);
}

let html = fs.readFileSync("dist/index.html", "utf8");
html = html.replace(/<!doctype html>\s*|<\/?html[^>]*>|<\/?head>|<\/?body>|<meta charset[^>]*>\s*|<meta name="viewport"[^>]*>\s*/gi, "");
html = html.replace(/<link rel="manifest"[^>]*>\s*/g, "").replace(/<meta name="theme-color"[^>]*>\s*/g, "");
const title = html.match(/<title>.*?<\/title>/)[0];
html = title + "\n" + html.replace(title, "").trim() + "\n";
fs.writeFileSync("dist/artifact.html", html);
console.log("dist/artifact.html ready");
