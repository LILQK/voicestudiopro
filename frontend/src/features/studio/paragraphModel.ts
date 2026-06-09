import { buildAudioProxyUrl } from "@/lib/apiClient";
import type { StoredParagraphStatus } from "@/lib/projectsStore";
import type {
  GenerationStatus,
  ModelItem,
  ParagraphItem,
  ParagraphStatus,
} from "./types";

const MAX_SEGMENT_CHARACTERS = 320;
export const PRESET_MODEL_ID_PREFIX = "preset:";

export const createId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const buildPresetModelItems = (
  presets: { id: string; name: string; size: number }[],
): ModelItem[] =>
  presets.map((preset) => ({
    id: `${PRESET_MODEL_ID_PREFIX}${preset.id}`,
    name: preset.name,
    size: preset.size,
    source: "preset",
    presetName: preset.id,
  }));

const splitOversizedBlock = (block: string, maxChars: number): string[] => {
  const cleaned = block;
  if (cleaned.length <= maxChars) {
    return [cleaned];
  }

  const pieces: string[] = [];
  let cursor = cleaned;

  while (cursor.length > maxChars) {
    let splitIndex = -1;
    for (let index = maxChars; index < cursor.length; index += 1) {
      const char = cursor[index];
      if (char === "." || char === ";") {
        splitIndex = index;
        break;
      }
    }

    // Never break in the middle if no punctuation appears after the threshold.
    if (splitIndex === -1) {
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
  const normalizedText = text.replace(/\r\n?/g, "\n");
  const rawBlocks = normalizedText.split(/\n+/);
  const hasTrailingParagraph = /\n$/.test(normalizedText);
  const baseBlocks = rawBlocks
    .map((block, index) => {
      const normalizedBlock = block.replace(/[^\S\n]+/g, " ");
      const hasText = normalizedBlock.trim().length > 0;
      const isTrailingBlank = hasTrailingParagraph && index === rawBlocks.length - 1;
      return hasText || isTrailingBlank ? normalizedBlock : null;
    })
    .filter((block): block is string => block !== null);

  return baseBlocks.flatMap((block) => splitOversizedBlock(block, MAX_SEGMENT_CHARACTERS));
};

export const reconcileParagraphsFromTexts = (
  previous: ParagraphItem[],
  texts: string[],
  defaultSpeakerModelId: string,
): ParagraphItem[] => {
  const usedIndexes = new Set<number>();

  return texts.map<ParagraphItem>((text, index) => {
    const exactIndex = previous.findIndex(
      (item, candidateIndex) => !usedIndexes.has(candidateIndex) && item.text === text,
    );
    if (exactIndex >= 0) {
      usedIndexes.add(exactIndex);
      return previous[exactIndex];
    }

    const previousItem = !usedIndexes.has(index) ? previous[index] : undefined;
    if (previousItem) {
      usedIndexes.add(index);
    }

    return {
      id: previousItem?.id ?? createId(),
      text,
      speakerModelId: previousItem?.speakerModelId ?? defaultSpeakerModelId,
      speakerOverridden: previousItem?.speakerOverridden ?? false,
      status: "pending",
      error: undefined,
      audioUrl: undefined,
      audioBlob: undefined,
    };
  });
};

export const areParagraphTextsEqual = (
  paragraphs: ParagraphItem[],
  texts: string[],
): boolean =>
  paragraphs.length === texts.length &&
  paragraphs.every((paragraph, index) => paragraph.text === texts[index]);

export const buildGenerationStatus = (paragraphs: ParagraphItem[]): GenerationStatus => {
  if (paragraphs.some((paragraph) => paragraph.status === "generating")) {
    return "running";
  }
  if (paragraphs.length > 0 && paragraphs.every((paragraph) => paragraph.status === "ok")) {
    return "completed";
  }
  if (paragraphs.some((paragraph) => paragraph.status === "error")) {
    return "partial_error";
  }
  return "idle";
};

export const hasParagraphAudio = (paragraph: ParagraphItem): boolean =>
  Boolean(paragraph.audioUrl || paragraph.audioBlob);

export const normalizeGeneratingStatus = (
  status: ParagraphStatus | StoredParagraphStatus,
  hasAudio: boolean,
): ParagraphStatus => {
  if (status !== "generating") {
    return status;
  }

  return hasAudio ? "ok" : "pending";
};

export const recoverInterruptedParagraph = (
  paragraph: ParagraphItem,
  reason: "cancelled" | "restored",
): ParagraphItem => {
  if (paragraph.status !== "generating") {
    return paragraph;
  }

  const hasAudio = hasParagraphAudio(paragraph);
  return {
    ...paragraph,
    status: normalizeGeneratingStatus(paragraph.status, hasAudio),
    error: hasAudio ? undefined : reason === "cancelled" ? "Generation cancelled." : undefined,
  };
};

export const getParagraphAudioSource = (
  paragraph: ParagraphItem,
): { src: string; cleanup?: () => void } | null => {
  if (paragraph.audioUrl) {
    return { src: buildAudioProxyUrl(paragraph.audioUrl) };
  }

  if (paragraph.audioBlob) {
    const objectUrl = URL.createObjectURL(paragraph.audioBlob);
    return {
      src: objectUrl,
      cleanup: () => URL.revokeObjectURL(objectUrl),
    };
  }

  return null;
};
