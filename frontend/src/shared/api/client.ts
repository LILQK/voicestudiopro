export type TorchVariant = "cpu" | "cu121" | "cu124";
export type RuntimeStatus = "missing" | "detecting" | "installing" | "ready" | "error";

export type HardwareInfo = {
  os_name: string;
  has_nvidia_gpu: boolean;
  nvidia_driver: string | null;
  cuda_from_driver: string | null;
  gpu_names: string[];
  recommended_torch: TorchVariant;
  reason: string;
};

export type RuntimeState = {
  status: RuntimeStatus;
  mock_inference: boolean;
  hardware: HardwareInfo | null;
  torch_variant: TorchVariant | null;
  installed_packages: string[];
  progress: number;
  message: string;
  last_error: string | null;
};

export type VoicePreset = {
  id: string;
  name: string;
  kind: string;
  path: string;
  size: number;
  created_at: number;
};

export type Paragraph = {
  id: string;
  text: string;
  voice_id: string | null;
  status: "pending" | "running" | "ok" | "error";
  audio_path?: string | null;
  audio_url?: string | null;
  error?: string | null;
};

export type GenerationJob = {
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

const readJson = async <T>(response: Response): Promise<T> => {
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = json?.error?.message ?? `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  return json as T;
};

export const api = {
  runtime: () => fetch("/api/runtime").then((response) => readJson<RuntimeState>(response)),
  installRuntime: (torch_variant?: TorchVariant) =>
    fetch("/api/runtime/install", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ torch_variant, include_qwen: true }),
    }).then((response) => readJson<RuntimeState>(response)),
  voices: () => fetch("/api/voices").then((response) => readJson<VoicePreset[]>(response)),
  uploadVoice: (name: string, file: File, transcript?: string) => {
    const form = new FormData();
    form.append("name", name);
    form.append("file", file);
    if (transcript) {
      form.append("transcript", transcript);
    }
    return fetch("/api/voices", { method: "POST", body: form }).then((response) =>
      readJson<VoicePreset>(response),
    );
  },
  createGenerationJob: (paragraphs: Paragraph[]) =>
    fetch("/api/generation/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paragraphs: paragraphs.map((paragraph) => ({
          id: paragraph.id,
          text: paragraph.text,
          voice_id: paragraph.voice_id,
        })),
      }),
    }).then((response) => readJson<GenerationJob>(response)),
  generationJob: (jobId: string) =>
    fetch(`/api/generation/jobs/${jobId}`).then((response) => readJson<GenerationJob>(response)),
  cancelGenerationJob: (jobId: string) =>
    fetch(`/api/generation/jobs/${jobId}/cancel`, { method: "POST" }).then((response) =>
      readJson<GenerationJob>(response),
    ),
};
