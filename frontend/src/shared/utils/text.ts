const MAX_SEGMENT_CHARACTERS = 320;

const splitOversizedBlock = (block: string): string[] => {
  const cleaned = block.trim();
  if (cleaned.length <= MAX_SEGMENT_CHARACTERS) {
    return [cleaned];
  }

  const pieces: string[] = [];
  let cursor = cleaned;
  while (cursor.length > MAX_SEGMENT_CHARACTERS) {
    let splitIndex = -1;
    for (let index = MAX_SEGMENT_CHARACTERS; index < cursor.length; index += 1) {
      if ([".", ";", "?", "!"].includes(cursor[index] ?? "")) {
        splitIndex = index;
        break;
      }
    }
    if (splitIndex === -1) {
      splitIndex = cursor.lastIndexOf(" ", MAX_SEGMENT_CHARACTERS);
    }
    if (splitIndex <= 0) {
      break;
    }
    pieces.push(cursor.slice(0, splitIndex + 1).trim());
    cursor = cursor.slice(splitIndex + 1).trim();
  }
  if (cursor) {
    pieces.push(cursor);
  }
  return pieces;
};

export const splitTextIntoParagraphs = (text: string): string[] => {
  const blocks = text
    .split(/\n\s*\n+/)
    .map((block) => block.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return blocks.flatMap(splitOversizedBlock);
};

export const createId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
};

