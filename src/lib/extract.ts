import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import mammoth from "mammoth";
import JSZip from "jszip";
import type { SourceFile } from "../types";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface Extracted {
  source: SourceFile;
  text: string;
  /** Pages or photos with no readable text, to be read by Claude as images. */
  images: Blob[];
}

const TEXT_EXT = ["txt", "md", "csv", "rtf", "html", "htm"];
const IMG_EXT = ["png", "jpg", "jpeg", "webp", "heic"];

function ext(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

async function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("Could not render page"))), "image/jpeg", 0.82),
  );
}

async function shrinkImage(file: Blob, max = 1600): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return canvasBlob(c);
}

async function readPdf(file: File): Promise<Extracted> {
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const parts: string[] = [];
  const images: Blob[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((it) => ("str" in it ? it.str + (it.hasEOL ? "\n" : " ") : ""))
      .join("")
      .replace(/[ \t]+/g, " ")
      .trim();
    if (text.length < 25 && images.length < 20) {
      // Scanned or photo page: keep a picture of it so Claude can read it.
      const vp = page.getViewport({ scale: 1.6 });
      const c = document.createElement("canvas");
      c.width = vp.width;
      c.height = vp.height;
      await page.render({ canvasContext: c.getContext("2d")!, viewport: vp }).promise;
      images.push(await canvasBlob(c));
      parts.push(`[Page ${i}] (scanned page, read from image)`);
    } else {
      parts.push(`[Page ${i}]\n${text}`);
    }
  }
  const text = parts.join("\n\n");
  return {
    source: { name: file.name, kind: "PDF", pages: doc.numPages, chars: text.length },
    text,
    images,
  };
}

async function readDocx(file: File): Promise<Extracted> {
  const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  const text = value.replace(/\n{3,}/g, "\n\n").trim();
  return { source: { name: file.name, kind: "Word", pages: 0, chars: text.length }, text, images: [] };
}

function decodeXml(s: string) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

async function readPptx(file: File): Promise<Extracted> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const slides = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  const parts: string[] = [];
  for (const [i, name] of slides.entries()) {
    const xml = await zip.files[name].async("string");
    const paras = xml.split(/<\/a:p>/).map((p) =>
      [...p.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => decodeXml(m[1])).join(""),
    );
    parts.push(`[Slide ${i + 1}]\n${paras.filter(Boolean).join("\n")}`);
  }
  const text = parts.join("\n\n");
  return { source: { name: file.name, kind: "Slides", pages: slides.length, chars: text.length }, text, images: [] };
}

export async function extractFile(file: File): Promise<Extracted> {
  const e = ext(file.name);
  if (e === "pdf") return readPdf(file);
  if (e === "docx") return readDocx(file);
  if (e === "pptx") return readPptx(file);
  if (TEXT_EXT.includes(e) || file.type.startsWith("text/")) {
    const text = (await file.text()).trim();
    return { source: { name: file.name, kind: "Text", pages: 0, chars: text.length }, text, images: [] };
  }
  if (IMG_EXT.includes(e) || file.type.startsWith("image/")) {
    const img = await shrinkImage(file);
    return {
      source: { name: file.name, kind: "Photo", pages: 1, chars: 0, note: "Read from image" },
      text: "",
      images: [img],
    };
  }
  return {
    source: { name: file.name, kind: e.toUpperCase() || "File", pages: 0, chars: 0, note: "This file type can't be read yet" },
    text: "",
    images: [],
  };
}

