import { Upload, UserRound } from "lucide-react";
import { useRef, useState } from "react";
import { api } from "../../shared/api/client";
import { Button } from "../../shared/components/Button";
import { useStudioStore } from "../../shared/state/studioStore";
import { formatBytes } from "../../shared/utils/text";

export function VoicePanel() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState("");
  const [transcript, setTranscript] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const voices = useStudioStore((state) => state.voices);
  const selectedVoiceId = useStudioStore((state) => state.selectedVoiceId);
  const setVoices = useStudioStore((state) => state.setVoices);
  const selectVoice = useStudioStore((state) => state.selectVoice);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setIsCreating(true);
    try {
      const voice = await api.uploadVoice(
        name.trim() || file.name.replace(/\.[^.]+$/, ""),
        file,
        transcript.trim() || undefined,
      );
      setVoices([voice, ...voices]);
      selectVoice(voice.id);
      setName("");
      setTranscript("");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <aside className="voice-panel">
      <header>
        <h2>Voces</h2>
        <Button className="icon-button" onClick={() => inputRef.current?.click()} aria-label="Upload voice">
          <Upload size={18} />
        </Button>
      </header>

      <label className="field-label" htmlFor="voice-name">
        Nombre de voz nueva
      </label>
      <input
        id="voice-name"
        className="text-input"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Narrador, Ana, Cliente..."
      />
      <label className="field-label" htmlFor="voice-transcript">
        Transcripcion del audio de referencia
      </label>
      <textarea
        id="voice-transcript"
        className="voice-transcript"
        value={transcript}
        onChange={(event) => setTranscript(event.target.value)}
        placeholder="Escribe exactamente lo que dice el audio si vas a crear una voz desde .wav/.mp3/.webm"
      />
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept=".pt,.pth,audio/*,.wav,.mp3,.flac,.webm,.m4a,.ogg"
        onChange={(event) => void upload(event.target.files?.[0])}
      />

      <div className="voice-list">
        {voices.length === 0 ? (
          <p className="muted">
            Sube un prompt `.pt`/`.pth` o crea uno desde audio de referencia con su transcripcion.
          </p>
        ) : null}
        {voices.map((voice) => (
          <button
            key={voice.id}
            type="button"
            className={`voice-item ${selectedVoiceId === voice.id ? "is-active" : ""}`}
            onClick={() => selectVoice(voice.id)}
          >
            <span className="voice-avatar">
              <UserRound size={16} />
            </span>
            <span>
              <strong>{voice.name}</strong>
              <small>{formatBytes(voice.size)}</small>
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}
