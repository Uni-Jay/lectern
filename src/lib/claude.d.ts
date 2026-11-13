// Minimal typing for the claude.ai artifact runtime (only present when the
// app runs as a published Claude artifact). In your own deployment the app
// falls back to the /api endpoints in server/.
interface ClaudeSampleError {
  code: string;
  message: string;
  text?: string;
}

interface ClaudeSampleOptions {
  signal?: AbortSignal;
  modelTier?: "quick" | "default" | "complex";
  images?: Blob[];
  cache?: boolean;
  onText?: (e: { text: string; delta: string }) => void;
}

interface ClaudeSample {
  (input: string, opts?: ClaudeSampleOptions): Promise<{ text: string; truncated: boolean }>;
  json<T = unknown>(input: string, opts?: ClaudeSampleOptions): Promise<T>;
  limits(): Promise<{ maxPromptBytes: number; images?: { maxCount: number; maxInputBytes: number; mediaTypes: string[] } }>;
}

interface ClaudeTtsLine {
  text: string;
  id?: string;
  rate?: number;
}

interface ClaudeTts {
  speak(text: string | ClaudeTtsLine[], opts?: { rate?: number; voice?: string }): Promise<void>;
  add(lines: ClaudeTtsLine[]): Promise<void>;
  stop(): void;
  pause(): void;
  resume(): void;
  setRate(r: number): void;
  onState(fn: (e: { state: string; reason?: string }) => void): void;
  onLine(fn: (e: { line: number; id?: string }) => void): void;
}

interface ClaudeDownloads {
  save(req: { filename: string; data: string | Blob }): Promise<unknown>;
}

interface Window {
  claude?: {
    use(name: "sample"): Promise<ClaudeSample | null>;
    use(name: "tts"): Promise<ClaudeTts | null>;
    use(name: "downloads"): Promise<ClaudeDownloads | null>;
    use(name: string): Promise<unknown>;
  };
}
