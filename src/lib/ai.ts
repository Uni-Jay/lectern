// One place where the app talks to Claude.
// 1. Running as a published Claude artifact: uses the built-in `sample` capability
//    (runs on the student's own Claude account, no API key needed).
// 2. Running on your own server: POSTs to /api/generate (see server/index.ts),
//    which calls the Claude API with your key.

export class AiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

let samplePromise: Promise<ClaudeSample | null> | null = null;
function getSample() {
  if (!samplePromise) {
    samplePromise = window.claude?.use
      ? window.claude.use("sample").catch(() => null)
      : Promise.resolve(null);
  }
  return samplePromise;
}

function parseJson<T>(text: string): T {
  const start = text.search(/[{[]/);
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (start < 0 || end < start) throw new AiError("invalid_json", "Claude's answer wasn't in the expected format.");
  return JSON.parse(text.slice(start, end + 1)) as T;
}

async function viaServer(prompt: string, images: Blob[] | undefined, signal?: AbortSignal): Promise<string> {
  const body = new FormData();
  body.append("prompt", prompt);
  images?.forEach((img, i) => body.append("images", img, `page-${i + 1}.jpg`));
  let res: Response;
  try {
    res = await fetch("/api/generate", { method: "POST", body, signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new AiError("cancelled", "Stopped.");
    throw new AiError("offline", "Couldn't reach the server. Check your connection and try again.");
  }
  if (!res.ok) {
    const msg = await res.json().then((j: { error?: string }) => j.error).catch(() => "");
    throw new AiError("upstream_error", msg || `The server returned an error (${res.status}).`);
  }
  const data = (await res.json()) as { text: string };
  return data.text;
}

export async function askText(prompt: string, opts: { signal?: AbortSignal; images?: Blob[] } = {}): Promise<string> {
  const sample = await getSample();
  if (sample) {
    try {
      const r = await sample(prompt, { signal: opts.signal, images: opts.images, modelTier: "default" });
      return r.text;
    } catch (e) {
      const err = e as ClaudeSampleError;
      throw new AiError(err.code ?? "upstream_error", err.message ?? "Claude couldn't answer.");
    }
  }
  return viaServer(prompt, opts.images, opts.signal);
}

export async function askJson<T>(prompt: string, opts: { signal?: AbortSignal } = {}): Promise<T> {
  const sample = await getSample();
  if (sample) {
    try {
      return await sample.json<T>(prompt, { signal: opts.signal, modelTier: "default" });
    } catch (e) {
      const err = e as ClaudeSampleError;
      if (err.code === "invalid_json" && err.text) return parseJson<T>(err.text);
      throw new AiError(err.code ?? "upstream_error", err.message ?? "Claude couldn't answer.");
    }
  }
  return parseJson<T>(await viaServer(prompt, undefined, opts.signal));
}

export async function imageLimit(): Promise<number> {
  const sample = await getSample();
  if (!sample) return 5;
  const lim = await sample.limits().catch(() => null);
  return lim?.images?.maxCount ?? 0;
}

export function friendlyError(e: unknown): string {
  const code = (e as AiError)?.code;
  switch (code) {
    case "cancelled":
      return "Stopped.";
    case "not_granted":
      return "Claude wasn't allowed to run on this page, so it can't read your notes. Reload the page and choose Allow.";
    case "rate_limited":
      return "Too many requests at once. Wait a minute, then try again.";
    case "prompt_too_large":
      return "This material is too long to send in one go. Try uploading fewer files at a time.";
    case "images_unavailable":
      return "Photos of notes can't be read in this view. Upload PDF, Word or slide files instead.";
    case "session_expired":
      return "Your Claude session expired. Reload the page and try again.";
    case "offline":
    case "upstream_error":
      return (e as Error).message;
    default:
      return `Claude couldn't finish this step${code ? ` (${code})` : ""}. Try again.`;
  }
}
