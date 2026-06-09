export type ModelItem = {
  id: string;
  name: string;
  size: number;
  source: "preset" | "uploaded";
  file?: File;
  presetName?: string;
};

export type ParagraphStatus = "pending" | "generating" | "ok" | "error";

export type ParagraphItem = {
  id: string;
  text: string;
  speakerModelId: string;
  speakerOverridden: boolean;
  status: ParagraphStatus;
  audioUrl?: string;
  audioBlob?: Blob;
  error?: string;
};

export type GenerationStatus = "idle" | "running" | "completed" | "partial_error";

export type ExportKind = "wav" | "premiere";

export type ProjectHistoryItem = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};
