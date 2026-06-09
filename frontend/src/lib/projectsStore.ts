export type StoredParagraphStatus = "pending" | "generating" | "ok" | "error";

export type StoredParagraph = {
  id: string;
  text: string;
  speakerModelId: string;
  speakerOverridden: boolean;
  status: StoredParagraphStatus;
  audioUrl?: string;
  audioBlob?: Blob;
  error?: string;
};

export type StoredProject = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  inputText: string;
  selectedModelId: string;
  paragraphs: StoredParagraph[];
};

type BackendParagraph = {
  id: string;
  text: string;
  voice_id?: string | null;
  speaker_model_id?: string | null;
  speaker_overridden?: boolean;
  status?: string;
  audio_path?: string | null;
  audio_url?: string | null;
  error?: string | null;
};

type BackendProject = {
  id: string;
  name: string;
  text?: string;
  selected_model_id?: string | null;
  paragraphs?: BackendParagraph[];
  created_at: number;
  updated_at: number;
};

const readJson = async <T>(response: Response): Promise<T> => {
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = json?.error?.message ?? `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  return json as T;
};

const fromBackendProject = (project: BackendProject): StoredProject => ({
  id: project.id,
  name: project.name,
  createdAt: Math.round(project.created_at * 1000),
  updatedAt: Math.round(project.updated_at * 1000),
  inputText: project.text ?? "",
  selectedModelId: project.selected_model_id ?? "",
  paragraphs: (project.paragraphs ?? []).map((paragraph) => ({
    id: paragraph.id,
    text: paragraph.text,
    speakerModelId: paragraph.speaker_model_id ?? paragraph.voice_id ?? "",
    speakerOverridden: paragraph.speaker_overridden ?? false,
    status: normalizeStoredStatus(paragraph.status),
    audioUrl: paragraph.audio_url ?? paragraph.audio_path ?? undefined,
    error: paragraph.error ?? undefined,
  })),
});

const normalizeStoredStatus = (status: string | undefined): StoredParagraphStatus => {
  if (status === "generating" || status === "ok" || status === "error") {
    return status;
  }
  return "pending";
};

const modelIdToVoiceId = (modelId: string): string | null => {
  if (!modelId) {
    return null;
  }
  return modelId.startsWith("preset:") ? modelId.slice("preset:".length) : modelId;
};

const toBackendProject = (project: StoredProject): BackendProject => ({
  id: project.id,
  name: project.name,
  text: project.inputText,
  selected_model_id: project.selectedModelId || null,
  created_at: project.createdAt / 1000,
  updated_at: project.updatedAt / 1000,
  paragraphs: project.paragraphs.map((paragraph) => ({
    id: paragraph.id,
    text: paragraph.text,
    voice_id: modelIdToVoiceId(paragraph.speakerModelId),
    speaker_model_id: paragraph.speakerModelId || null,
    speaker_overridden: paragraph.speakerOverridden,
    status: paragraph.status,
    audio_url: paragraph.audioUrl ?? null,
    error: paragraph.error ?? null,
  })),
});

export const listProjects = async (): Promise<StoredProject[]> => {
  const response = await fetch("/api/projects");
  const projects = await readJson<BackendProject[]>(response);
  return projects.map(fromBackendProject).sort((left, right) => right.updatedAt - left.updatedAt);
};

export const getProject = async (id: string): Promise<StoredProject | undefined> => {
  const response = await fetch(`/api/projects/${encodeURIComponent(id)}`);
  if (response.status === 404) {
    return undefined;
  }
  return fromBackendProject(await readJson<BackendProject>(response));
};

export const upsertProject = async (project: StoredProject): Promise<void> => {
  await readJson<BackendProject>(
    await fetch(`/api/projects/${encodeURIComponent(project.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toBackendProject(project)),
    }),
  );
};

export const renameProject = async (id: string, name: string): Promise<StoredProject | undefined> => {
  const existing = await getProject(id);
  if (!existing) {
    return undefined;
  }

  const next: StoredProject = {
    ...existing,
    name,
    updatedAt: Date.now(),
  };
  await upsertProject(next);
  return next;
};

export const deleteProject = async (id: string): Promise<void> => {
  const response = await fetch(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok && response.status !== 404) {
    await readJson(response);
  }
};
