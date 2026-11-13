// Light helpers that don't pull in the PDF/Word readers (those load only when a file is added).
export const ACCEPT = ".pdf,.docx,.pptx,.txt,.md,.csv,.png,.jpg,.jpeg,.webp";

/** Walk a dropped folder (Chrome/Edge/Safari) into a flat list of files. */
export async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const entries = [...dt.items]
    .map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null))
    .filter((e): e is FileSystemEntry => !!e);
  if (!entries.length) return [...dt.files];
  const out: File[] = [];
  const walk = async (entry: FileSystemEntry): Promise<void> => {
    if (entry.isFile) {
      out.push(await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej)));
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      let batch: FileSystemEntry[];
      do {
        batch = await new Promise((res, rej) => reader.readEntries(res, rej));
        for (const child of batch) await walk(child);
      } while (batch.length);
    }
  };
  for (const e of entries) await walk(e);
  return out;
}

/** Split long text into parts at paragraph boundaries, so every page gets read. */
export function chunkText(text: string, size = 12000): string[] {
  const paras = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let cur = "";
  for (const p of paras) {
    if (cur.length + p.length > size && cur) {
      chunks.push(cur);
      cur = "";
    }
    if (p.length > size) {
      for (let i = 0; i < p.length; i += size) chunks.push(p.slice(i, i + size));
    } else {
      cur += (cur ? "\n\n" : "") + p;
    }
  }
  if (cur.trim()) chunks.push(cur);
  return chunks;
}
