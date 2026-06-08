import { Cpu, Download, HardDrive, MonitorCheck, RefreshCw } from "lucide-react";
import { api, type RuntimeState, type TorchVariant } from "../../shared/api/client";
import { Button } from "../../shared/components/Button";
import { Progress } from "../../shared/components/Progress";
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

  return (
    <main className="onboarding-shell">
      <section className="onboarding-panel">
        <div className="product-mark">VoiceStudio Pro</div>
        <h1>Prepara el motor local de voz</h1>
        <p>
          La app se instala ligera. Torch, QwenTTS y los pesos pesados se descargan en este
          equipo según compatibilidad real.
        </p>

        <div className="diagnostic-grid">
          <div className="diagnostic-row">
            <MonitorCheck />
            <div>
              <strong>{runtime.hardware?.os_name ?? "Windows"}</strong>
              <span>Sistema detectado</span>
            </div>
          </div>
          <div className="diagnostic-row">
            <Cpu />
            <div>
              <strong>
                {runtime.hardware?.gpu_names.length
                  ? runtime.hardware.gpu_names.join(", ")
                  : "Sin GPU NVIDIA usable"}
              </strong>
              <span>{runtime.hardware?.reason ?? runtime.message}</span>
            </div>
          </div>
          <div className="diagnostic-row">
            <HardDrive />
            <div>
              <strong>{variantLabel[recommended]}</strong>
              <span>Runtime recomendado para Torch</span>
            </div>
          </div>
        </div>

        {runtime.status === "installing" ? (
          <div className="install-state">
            <Progress value={runtime.progress} />
            <p>{runtime.message}</p>
          </div>
        ) : null}

        {runtime.last_error ? <p className="error-text">{runtime.last_error}</p> : null}

        <div className="onboarding-actions">
          <Button variant="primary" onClick={() => install(recommended)} disabled={runtime.status === "installing"}>
            <Download size={18} />
            Instalar {variantLabel[recommended]}
          </Button>
          <Button onClick={refresh}>
            <RefreshCw size={18} />
            Reanalizar
          </Button>
        </div>
      </section>
    </main>
  );
}
