import { Cpu, Download, HardDrive, MonitorCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, type RuntimeState, type TorchVariant } from "../../shared/api/client";
import { useStudioStore } from "../../shared/state/studioStore";

const variantLabel: Record<TorchVariant, string> = {
  cpu: "CPU",
  cu121: "CUDA 12.1",
  cu124: "CUDA 12.4",
};

type OnboardingProps = {
  runtime: RuntimeState;
};

export function Onboarding({ runtime }: OnboardingProps) {
  const setRuntime = useStudioStore((state) => state.setRuntime);

  const refresh = async () => {
    setRuntime(await api.runtime());
  };

  const install = async (variant?: TorchVariant) => {
    setRuntime({
      ...runtime,
      status: "installing",
      progress: 0.05,
      message: "Preparing runtime installer...",
    });
    let next = await api.installRuntime(variant);
    setRuntime(next);

    while (next.status === "installing") {
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
      next = await api.runtime();
      setRuntime(next);
    }
  };

  const recommended = runtime.hardware?.recommended_torch ?? "cpu";
  const progressPercent = `${Math.max(0, Math.min(100, runtime.progress * 100))}%`;

  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 py-10 text-foreground">
      <section className="w-full max-w-3xl rounded-lg border border-border bg-card p-8 shadow-xl">
        <div className="w-fit rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground">
          VoiceStudio Pro
        </div>
        <h1 className="mt-5 max-w-2xl text-4xl font-semibold leading-tight md:text-5xl">
          Prepara el motor local de voz
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          La app se instala ligera. Torch, QwenTTS y los pesos pesados se descargan en este
          equipo según compatibilidad real.
        </p>

        <div className="my-7 grid gap-3">
          <div className="grid min-h-16 grid-cols-[44px_1fr] items-center gap-3 rounded-lg border border-border bg-muted/40 p-3">
            <MonitorCheck className="text-primary" />
            <div>
              <strong className="block">{runtime.hardware?.os_name ?? "Windows"}</strong>
              <span className="mt-1 block text-sm text-muted-foreground">Sistema detectado</span>
            </div>
          </div>
          <div className="grid min-h-16 grid-cols-[44px_1fr] items-center gap-3 rounded-lg border border-border bg-muted/40 p-3">
            <Cpu className="text-primary" />
            <div>
              <strong className="block">
                {runtime.hardware?.gpu_names.length
                  ? runtime.hardware.gpu_names.join(", ")
                  : "Sin GPU NVIDIA usable"}
              </strong>
              <span className="mt-1 block text-sm text-muted-foreground">
                {runtime.hardware?.reason ?? runtime.message}
              </span>
            </div>
          </div>
          <div className="grid min-h-16 grid-cols-[44px_1fr] items-center gap-3 rounded-lg border border-border bg-muted/40 p-3">
            <HardDrive className="text-primary" />
            <div>
              <strong className="block">{variantLabel[recommended]}</strong>
              <span className="mt-1 block text-sm text-muted-foreground">
                Runtime recomendado para Torch
              </span>
            </div>
          </div>
        </div>

        {runtime.status === "installing" ? (
          <div className="mb-5 grid gap-2">
            <div className="h-2 overflow-hidden rounded-full bg-muted" aria-label="Progress">
              <span className="block h-full rounded-full bg-primary" style={{ width: progressPercent }} />
            </div>
            <p className="text-sm text-muted-foreground">{runtime.message}</p>
          </div>
        ) : null}

        {runtime.last_error ? (
          <p className="mb-4 text-sm text-destructive">{runtime.last_error}</p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => install(recommended)} disabled={runtime.status === "installing"}>
            <Download size={18} />
            Instalar {variantLabel[recommended]}
          </Button>
          <Button variant="outline" onClick={refresh}>
            <RefreshCw size={18} />
            Reanalizar
          </Button>
        </div>
      </section>
    </main>
  );
}
