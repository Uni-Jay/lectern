// Voice input for "Ask my notes": the Claude dictation capability in the
// artifact, or the browser's speech recognition elsewhere (Chrome, Edge, Android).
import { useEffect, useRef, useState } from "react";

interface ClaudeDictation {
  start(): Promise<void>;
  stop(): Promise<void>;
  onFinal(fn: (e: { text: string }) => void): () => void;
  onState(fn: (e: { state: string; reason?: string }) => void): () => void;
}

type Rec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
};

let claudeDict: Promise<ClaudeDictation | null> | null = null;

export function useDictation(onText: (text: string) => void) {
  const [available, setAvailable] = useState(false);
  const [listening, setListening] = useState(false);
  const cb = useRef(onText);
  cb.current = onText;
  const dictRef = useRef<ClaudeDictation | null>(null);
  const recRef = useRef<Rec | null>(null);

  useEffect(() => {
    let off: (() => void)[] = [];
    const Browser = (window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => Rec }).webkitSpeechRecognition;
    if (window.claude?.use) {
      claudeDict ??= window.claude.use("dictation").catch(() => null) as Promise<ClaudeDictation | null>;
      claudeDict.then((d) => {
        if (!d) return;
        dictRef.current = d;
        setAvailable(true);
        off = [d.onFinal(({ text }) => cb.current(text)), d.onState(({ state }) => setListening(state === "listening" || state === "starting"))];
      });
    } else if (Browser) {
      const r = new Browser();
      r.continuous = true;
      r.interimResults = false;
      r.lang = navigator.language || "en-NG";
      r.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) cb.current(e.results[i][0].transcript.trim());
      };
      r.onend = () => setListening(false);
      recRef.current = r;
      setAvailable(true);
    }
    return () => off.forEach((f) => f());
  }, []);

  const start = () => {
    if (dictRef.current) {
      dictRef.current.start().catch(() => setListening(false));
    } else if (recRef.current) {
      try {
        recRef.current.start();
        setListening(true);
      } catch {
        /* already started */
      }
    }
  };
  const stop = () => {
    if (dictRef.current) dictRef.current.stop().catch(() => {});
    else recRef.current?.stop();
    setListening(false);
  };
  return { available, listening, start, stop, toggle: () => (listening ? stop() : start()) };
}
