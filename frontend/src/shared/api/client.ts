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
};
