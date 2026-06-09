export type QwenStatus = "starting" | "ready" | "error";

export type QwenState = {
  status: QwenStatus;
  launchedByApp: boolean;
  attempts: number;
  startupElapsedMs: number;
  lastError: string | null;
  apiUrl: string;
};

export type ProxyResult = {
  data: unknown;
  upstreamStatus: number;
  elapsedMs: number;
  transport?: string;
};

export type VoicePreset = {
  id: string;
  name: string;
  kind?: string;
  path?: string;
  size: number;
  mtimeMs: number;
  created_at?: number;
};

type RuntimeState = {
  status: "missing" | "detecting" | "installing" | "ready" | "error";
  mock_inference: boolean;
  progress: number;
  message: string;
  last_error: string | null;
};

type BackendVoicePreset = {
  id: string;
  name: string;
  kind: string;
  path: string;
  size: number;
  created_at: number;
};

type GenerationJob = {
  id: string;
  status: "queued" | "running" | "completed" | "partial_error" | "cancelled" | "error";
  progress: number;
  message: string;
  results: Array<{
    paragraph_id: string;
    status: string;
    audio_url: string | null;
    error: string | null;
  }>;
};

const extractApiMessage = (json: unknown): string | null => {
  if (
    json &&
    typeof json === "object" &&
    "error" in json &&
    typeof (json as { error?: { message?: unknown } }).error?.message === "string"
  ) {
    return (json as { error: { message: string } }).error.message;
  }

  return null;
};

const readJson = async <T>(response: Response): Promise<T> => {
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(extractApiMessage(json) ?? `Request failed with status ${response.status}`);
  }
  return json as T;
};

const toLegacyVoicePreset = (voice: BackendVoicePreset): VoicePreset => ({
  id: voice.id,
  name: voice.name,
  kind: voice.kind,
  path: voice.path,
  size: voice.size,
  created_at: voice.created_at,
  mtimeMs: voice.created_at * 1000,
});

const waitForGenerationJob = async (jobId: string, signal?: AbortSignal): Promise<GenerationJob> => {
  while (true) {
    if (signal?.aborted) {
      throw new DOMException("Generation cancelled.", "AbortError");
    }

    const job = await readJson<GenerationJob>(
      await fetch(`/api/generation/jobs/${encodeURIComponent(jobId)}`, { signal }),
    );
    if (["completed", "partial_error", "cancelled", "error"].includes(job.status)) {
      return job;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 500));
  }
};

const firstFormFile = (payload: FormData, names: string[]): File | null => {
  for (const name of names) {
    const value = payload.get(name);
    if (value instanceof File) {
      return value;
    }
  }
  return null;
};

const textFromPayload = (payload: FormData | Record<string, unknown>, key: string): string => {
  if (payload instanceof FormData) {
    const value = payload.get(key);
    return typeof value === "string" ? value : "";
  }
  const value = payload[key];
  return typeof value === "string" ? value : "";
};

const resolveVoiceId = async (
  payload: FormData | Record<string, unknown>,
  signal?: AbortSignal,
): Promise<string | null> => {
  const voicePreset = textFromPayload(payload, "voicePreset").trim();
  if (voicePreset) {
    const voices = await getVoicePresets();
    return (
      voices.find(
        (voice) =>
          voice.id === voicePreset ||
          voice.name === voicePreset ||
          voice.path?.split(/[\\/]/).at(-1) === voicePreset,
      )?.id ?? voicePreset
    );
  }

  if (!(payload instanceof FormData)) {
    return null;
  }

  const file = firstFormFile(payload, ["file", "audio"]);
  if (!file) {
    return null;
  }

  const form = new FormData();
  form.append("name", file.name.replace(/\.[^.]+$/, "") || file.name);
  form.append("file", file);
  const transcript = textFromPayload(payload, "transcript") || textFromPayload(payload, "ref_txt");
  if (transcript) {
    form.append("transcript", transcript);
  }

  const voice = await readJson<BackendVoicePreset>(
    await fetch("/api/voices", { method: "POST", body: form, signal }),
  );
  return voice.id;
};

export const getQwenStatus = async (): Promise<QwenState> => {
  const runtime = await readJson<RuntimeState>(await fetch("/api/runtime"));
  return {
    status: runtime.status === "ready" ? "ready" : runtime.status === "installing" ? "starting" : "error",
    launchedByApp: true,
    attempts: 0,
    startupElapsedMs: Math.round(runtime.progress * 1000),
    lastError: runtime.last_error,
    apiUrl: runtime.mock_inference ? "python://mock-inference" : "python://qwen-tts",
  };
};

export const runVoiceClone = async (
  payload: FormData | Record<string, unknown>,
): Promise<ProxyResult> => loadPromptAndGen(payload);

export const savePrompt = async (
  payload: FormData | Record<string, unknown>,
): Promise<ProxyResult> => {
  if (!(payload instanceof FormData)) {
    throw new Error("Voice prompt creation requires form data.");
  }

  const voiceId = await resolveVoiceId(payload);
  if (!voiceId) {
    throw new Error("Reference audio or prompt file is required.");
  }
  const voices = await getVoicePresets();
  const voice = voices.find((item) => item.id === voiceId);
  return {
    data: { url: voice?.path ?? voiceId },
    upstreamStatus: 200,
    elapsedMs: 0,
    transport: "python_voices",
  };
};

export const loadPromptAndGen = async (
  payload: FormData | Record<string, unknown>,
  options?: { signal?: AbortSignal },
): Promise<ProxyResult> => {
  const started = performance.now();
  const text =
    textFromPayload(payload, "text").trim() || textFromPayload(payload, "targetText").trim();
  if (!text) {
    throw new Error("Text is required.");
  }

  const voiceId = await resolveVoiceId(payload, options?.signal);
  const createResponse = await fetch("/api/generation/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      paragraphs: [
        {
          id: crypto.randomUUID(),
          text,
          voice_id: voiceId,
        },
      ],
    }),
    signal: options?.signal,
  });
  const created = await readJson<GenerationJob>(createResponse);
  const completed = await waitForGenerationJob(created.id, options?.signal);
  const result = completed.results[0];
  if (!result || result.status !== "ok" || !result.audio_url) {
    throw new Error(result?.error ?? completed.message ?? "Generation failed.");
  }

  return {
    data: { url: result.audio_url },
    upstreamStatus: 200,
    elapsedMs: Math.round(performance.now() - started),
    transport: "python_generation_jobs",
  };
};

const hasUrl = (value: unknown): value is { url: string } =>
  Boolean(
    value &&
      typeof value === "object" &&
      "url" in value &&
      typeof (value as { url: unknown }).url === "string",
  );

const findAudioUrl = (value: unknown): string | null => {
  if (hasUrl(value)) {
    return value.url;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = findAudioUrl(item);
      if (nested) {
        return nested;
      }
    }
    return null;
  }

  if (value && typeof value === "object") {
    for (const nestedValue of Object.values(value)) {
      const nested = findAudioUrl(nestedValue);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
};

export const extractGeneratedAudioUrl = (result: ProxyResult): string | null => findAudioUrl(result.data);

export const buildAudioProxyUrl = (sourceUrl: string): string => sourceUrl;

export const fetchAudioViaProxy = async (
  sourceUrl: string,
  options?: { signal?: AbortSignal },
): Promise<Blob> => {
  const response = await fetch(buildAudioProxyUrl(sourceUrl), {
    signal: options?.signal,
  });
  if (!response.ok) {
    throw new Error(`Unable to fetch generated audio (${response.status})`);
  }

  return response.blob();
};

export const deleteGeneratedAudioViaProxy = async (sourceUrl: string): Promise<void> => {
  const response = await fetch(sourceUrl, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(`Unable to delete generated audio (${response.status})`);
  }
};

export const getVoicePresets = async (): Promise<VoicePreset[]> => {
  const voices = await readJson<BackendVoicePreset[]>(await fetch("/api/voices"));
  return voices.map(toLegacyVoicePreset);
};

export const createVoicePreset = async (payload: FormData): Promise<VoicePreset> => {
  const form = new FormData();
  form.append("name", textFromPayload(payload, "name"));
  const file = firstFormFile(payload, ["file", "audio"]);
  if (file) {
    form.append("file", file);
  }
  const transcript = textFromPayload(payload, "transcript") || textFromPayload(payload, "ref_txt");
  if (transcript) {
    form.append("transcript", transcript);
  }

  const response = await fetch("/api/voices", {
    method: "POST",
    body: form,
  });
  return toLegacyVoicePreset(await readJson<BackendVoicePreset>(response));
};

export const renameVoicePreset = async (voiceName: string, newName: string): Promise<VoicePreset> => {
  const response = await fetch(`/api/voices/${encodeURIComponent(voiceName)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: newName }),
  });
  return toLegacyVoicePreset(await readJson<BackendVoicePreset>(response));
};

export const deleteVoicePreset = async (voiceName: string): Promise<void> => {
  const response = await fetch(`/api/voices/${encodeURIComponent(voiceName)}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    await readJson(response);
  }
};


