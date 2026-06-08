import { Play, Scissors, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, type GenerationJob } from "../../shared/api/client";
import { Button } from "../../shared/components/Button";
import { Progress } from "../../shared/components/Progress";
import { useStudioStore } from "../../shared/state/studioStore";

export function ScriptEditor() {
  const [job, setJob] = useState<GenerationJob | null>(null);
  const pollRef = useRef<number | null>(null);
  const text = useStudioStore((state) => state.text);
  const paragraphs = useStudioStore((state) => state.paragraphs);
  const runtime = useStudioStore((state) => state.runtime);
  const voices = useStudioStore((state) => state.voices);
  const selectedVoiceId = useStudioStore((state) => state.selectedVoiceId);
  const setText = useStudioStore((state) => state.setText);
  const segmentText = useStudioStore((state) => state.segmentText);
  const setParagraphs = useStudioStore((state) => state.setParagraphs);
  const setActiveAudioUrl = useStudioStore((state) => state.setActiveAudioUrl);

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  const generate = async () => {
    const targetParagraphs =
      paragraphs.length > 0
        ? paragraphs
        : text
            .split(/\n\s*\n+/)
            .filter(Boolean)
            .map((item, index) => ({
              id: `inline-${index}`,
              text: item,
              voice_id: selectedVoiceId,
              status: "pending" as const,
            }));

    const pending = targetParagraphs.map((paragraph) => ({
      ...paragraph,
      voice_id: paragraph.voice_id ?? selectedVoiceId,
      status: "running" as const,
    }));
    setParagraphs(pending);
    let created: GenerationJob;
    try {
      created = await api.createGenerationJob(pending);
      setJob(created);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to start generation";
      setParagraphs(
        pending.map((paragraph) => ({
          ...paragraph,
          status: "error" as const,
          error: message,
        })),
      );
      setJob({
        id: "local-validation",
        status: "error",
        progress: 1,
        message,
        results: [],
      });
      return;
    }

    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      const next = await api.generationJob(created.id);
      setJob(next);
      setParagraphs(
        pending.map((paragraph) => {
          const result = next.results.find((item) => item.paragraph_id === paragraph.id);
          if (!result) return paragraph;
          return {
            ...paragraph,
            status: result.status === "ok" ? "ok" : "error",
            audio_url: result.audio_url,
            error: result.error,
          };
        }),
      );
      if (["completed", "partial_error", "cancelled", "error"].includes(next.status) && pollRef.current) {
        window.clearInterval(pollRef.current);
      }
    }, 900);
  };

  const cancel = async () => {
    if (!job) return;
    setJob(await api.cancelGenerationJob(job.id));
  };

  const isMockInference = runtime?.mock_inference ?? false;
  const hasVoiceForRealGeneration = isMockInference || Boolean(selectedVoiceId);
  const hasTextToGenerate = paragraphs.length > 0 || text.trim().length > 0;
  const canGenerate = hasTextToGenerate && hasVoiceForRealGeneration && job?.status !== "running";

  return (
    <section className="script-editor">
      <header className="studio-toolbar">
        <div>
          <h1>Guion</h1>
          <p>{paragraphs.length} segmentos preparados</p>
        </div>
        <div className="toolbar-actions">
          <Button onClick={segmentText} disabled={!text.trim() || job?.status === "running"}>
            <Scissors size={18} />
            Segmentar
          </Button>
          {job?.status === "running" ? (
            <Button variant="danger" onClick={cancel}>
              <Square size={18} />
              Cancelar
            </Button>
          ) : (
            <Button variant="primary" onClick={generate} disabled={!canGenerate}>
              <Play size={18} />
              {isMockInference ? "Generar demo" : "Generar"}
            </Button>
          )}
        </div>
      </header>

      {isMockInference ? (
        <div className="runtime-warning" role="status">
          <strong>Modo demo activo.</strong>
          <span>
            El backend esta conectado, pero todavia no esta usando QwenTTS real. El audio generado
            es una onda placeholder para probar cola, timeline y UI.
          </span>
        </div>
      ) : null}

      {!isMockInference && voices.length === 0 ? (
        <div className="runtime-warning" role="status">
          <strong>Falta una voz Qwen.</strong>
          <span>
            Sube un prompt `.pt`/`.pth` en el panel de voces antes de generar audio real.
          </span>
        </div>
      ) : null}

      {job ? (
        <div className="job-strip">
          <Progress value={job.progress} />
          <span>{job.message}</span>
        </div>
      ) : null}

      {paragraphs.length === 0 ? (
        <textarea
          className="script-input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Pega aquí un guion largo. La app lo segmentará en bloques estables para generación por cola."
        />
      ) : (
        <div className="paragraph-list">
          {paragraphs.map((paragraph, index) => (
            <article key={paragraph.id} className={`paragraph-row status-${paragraph.status}`}>
              <span className="paragraph-index">{index + 1}</span>
              <textarea
                value={paragraph.text}
                onChange={(event) =>
                  setParagraphs(
                    paragraphs.map((item) =>
                      item.id === paragraph.id ? { ...item, text: event.target.value } : item,
                    ),
                  )
                }
              />
              <div className="paragraph-actions">
                {paragraph.audio_url ? (
                  <Button onClick={() => setActiveAudioUrl(paragraph.audio_url ?? null)}>
                    <Play size={16} />
                  </Button>
                ) : (
                  <span>{paragraph.error ?? paragraph.status}</span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
