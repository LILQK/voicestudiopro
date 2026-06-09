import type {
  StoredProject,
} from "@/lib/projectsStore";
import type { ParagraphItem, ProjectHistoryItem } from "@/features/studio/types";
import { hasParagraphAudio } from "@/features/studio/paragraphModel";

const twoDigits = (value: number): string => value.toString().padStart(2, "0");

export const buildProjectName = (timestampMs: number): string => {
  const date = new Date(timestampMs);
  return `Project ${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())} ${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
};

export const sortProjectHistory = (items: ProjectHistoryItem[]): ProjectHistoryItem[] =>
  [...items].sort((left, right) => right.updatedAt - left.updatedAt);

export const toHistoryItem = (project: StoredProject): ProjectHistoryItem => ({
  id: project.id,
  name: project.name,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
});

export const upsertHistoryItem = (
  previous: ProjectHistoryItem[],
  item: ProjectHistoryItem,
): ProjectHistoryItem[] =>
  sortProjectHistory([item, ...previous.filter((project) => project.id !== item.id)]);

export const hasMeaningfulSessionData = (
  inputText: string,
  paragraphs: ParagraphItem[],
): boolean => {
  if (inputText.trim().length > 0) {
    return true;
  }

  return paragraphs.some(
    (paragraph) => paragraph.text.trim().length > 0 || hasParagraphAudio(paragraph),
  );
};

export const buildProjectContentSignature = (
  inputText: string,
  selectedModelId: string,
  paragraphs: ParagraphItem[],
): string =>
  JSON.stringify({
    inputText,
    selectedModelId,
    paragraphs: paragraphs.map((paragraph) => ({
      id: paragraph.id,
      text: paragraph.text,
      speakerModelId: paragraph.speakerModelId,
      speakerOverridden: paragraph.speakerOverridden,
      status: paragraph.status,
      error: paragraph.error ?? "",
      audioUrl: paragraph.audioUrl ?? "",
      audioSize: paragraph.audioBlob?.size ?? 0,
      audioType: paragraph.audioBlob?.type ?? "",
    })),
  });
