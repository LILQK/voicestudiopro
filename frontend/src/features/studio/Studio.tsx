import { Activity, Settings } from "lucide-react";
import { useStudioStore } from "../../shared/state/studioStore";
import { ScriptEditor } from "./ScriptEditor";
import { Timeline } from "./Timeline";
import { VoicePanel } from "./VoicePanel";

export function Studio() {
  const runtime = useStudioStore((state) => state.runtime);

  return (
    <main className="studio-shell">
      <nav className="app-sidebar">
        <div className="brand-block">
          <span className="brand-dot" />
          <div>
            <strong>VoiceStudio Pro</strong>
            <small>Local QwenTTS studio</small>
          </div>
        </div>
        <button className="nav-item is-active" type="button">
          <Activity size={18} />
          Studio
        </button>
        <button className="nav-item" type="button">
          <Settings size={18} />
          Runtime
        </button>
        <div className="runtime-card">
          <span>Runtime</span>
          <strong>{runtime?.mock_inference ? "DEMO" : runtime?.torch_variant?.toUpperCase() ?? "DEV"}</strong>
          <small>{runtime?.message ?? "Mock inference enabled"}</small>
        </div>
      </nav>
      <ScriptEditor />
      <VoicePanel />
      <Timeline />
    </main>
  );
}
