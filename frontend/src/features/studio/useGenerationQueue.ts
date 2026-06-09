import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { extractGeneratedAudioUrl, loadPromptAndGen } from "@/lib/apiClient";
import type { GenerationStatus, ModelItem, ParagraphItem } from "./types";

type SetState<T> = Dispatch<SetStateAction<T>>;

type UseGenerationQueueParams = {
  generationStatus: GenerationStatus;
  isQwenReady: boolean;
  models: ModelItem[];
  orderedSelectedParagraphIds: string[];
  paragraphsRef: MutableRefObject<ParagraphItem[]>;
  selectedModel: ModelItem | null;
  setGenerationStatus: SetState<GenerationStatus>;
  setGlobalError: SetState<string | null>;
  setParagraphDurations: SetState<Record<string, number>>;
  setParagraphs: SetState<ParagraphItem[]>;
  setSelectedParagraphIds: SetState<string[]>;
};

const hasParagraphAudio = (paragraph: ParagraphItem): boolean =>
  Boolean(paragraph.audioUrl || paragraph.audioBlob);

const buildGenerationStatus = (paragraphs: ParagraphItem[]): GenerationStatus => {
  if (paragraphs.some((paragraph) => paragraph.status === "generating")) {
    return "running";
  }
  if (paragraphs.some((paragraph) => paragraph.status === "error")) {
    return "partial_error";
  }
  if (paragraphs.length > 0 && paragraphs.every((paragraph) => paragraph.status === "ok")) {
    return "completed";
  }
  return "idle";
};

const recoverInterruptedParagraph = (
  paragraph: ParagraphItem,
  reason: "cancelled" | "restored",
): ParagraphItem => {
  if (paragraph.status !== "generating") {
    return paragraph;
  }

  const hasAudio = hasParagraphAudio(paragraph);
  return {
    ...paragraph,
    status: hasAudio ? "ok" : "pending",
    error: hasAudio ? undefined : reason === "cancelled" ? "Generation cancelled." : undefined,
  };
};

export function useGenerationQueue({
  generationStatus,
  isQwenReady,
  models,
  orderedSelectedParagraphIds,
  paragraphsRef,
  selectedModel,
  setGenerationStatus,
  setGlobalError,
  setParagraphDurations,
  setParagraphs,
  setSelectedParagraphIds,
}: UseGenerationQueueParams) {
  const runIdRef = useRef(0);
  const generationAbortControllerRef = useRef<AbortController | null>(null);

  const updateParagraph = useCallback(
    (id: string, updater: (item: ParagraphItem) => ParagraphItem): void => {
      setParagraphs((previous) => previous.map((item) => (item.id === id ? updater(item) : item)));
    },
    [setParagraphs],
  );

  const abortGeneration = useCallback((): void => {
    runIdRef.current = Date.now();
    generationAbortControllerRef.current?.abort();
    generationAbortControllerRef.current = null;
  }, []);

  const generateSingleParagraph = useCallback(
    async (id: string, runId: number, signal?: AbortSignal): Promise<boolean> => {
      const target = paragraphsRef.current.find((item) => item.id === id);
      if (!target) {
        return false;
      }

      const assignedModel = models.find((item) => item.id === target.speakerModelId);
      const activeModel = assignedModel ?? selectedModel;

      if (!activeModel) {
        updateParagraph(id, (item) => ({
          ...item,
          status: "error",
          error: "No valid voice model is available for this paragraph.",
        }));
        return false;
      }

      if (!assignedModel && target.speakerModelId) {
        updateParagraph(id, (item) => ({
          ...item,
          speakerModelId: activeModel.id,
          speakerOverridden: false,
        }));
      }

      if (!target.text.trim()) {
        updateParagraph(id, (item) => ({
          ...item,
          status: "error",
          error: "This paragraph is empty.",
        }));
        return false;
      }

      updateParagraph(id, (item) => ({
        ...item,
        status: "generating",
        audioUrl: undefined,
        audioBlob: undefined,
        error: undefined,
      }));
      setParagraphDurations((previous) => {
        if (!(id in previous)) {
          return previous;
        }
        const next = { ...previous };
        delete next[id];
        return next;
      });

      try {
        const formData = new FormData();
        formData.append("text", target.text);
        if (activeModel.source === "preset" && activeModel.presetName) {
          formData.append("voicePreset", activeModel.presetName);
        } else if (activeModel.file) {
          formData.append("audio", activeModel.file);
        } else {
          throw new Error("Selected voice model is invalid.");
        }

        const result = await loadPromptAndGen(formData, { signal });
        const audioUrl = extractGeneratedAudioUrl(result);

        if (!audioUrl) {
          throw new Error("No audio URL found in Qwen response.");
        }

        if (runId !== runIdRef.current) {
          return false;
        }

        updateParagraph(id, (item) => ({
          ...item,
          status: "ok",
          audioUrl,
          audioBlob: undefined,
          error: undefined,
        }));

        return true;
      } catch (error) {
        if (runId !== runIdRef.current) {
          return false;
        }

        updateParagraph(id, (item) => ({
          ...item,
          status: "error",
          audioUrl: undefined,
          audioBlob: undefined,
          error: error instanceof Error ? error.message : "Unknown error while generating audio.",
        }));
        return false;
      }
    },
    [models, paragraphsRef, selectedModel, setParagraphDurations, updateParagraph],
  );

  const runQueue = useCallback(
    async (ids: string[]): Promise<void> => {
      const runId = Date.now();
      const abortController = new AbortController();
      runIdRef.current = runId;
      generationAbortControllerRef.current = abortController;
      setGlobalError(null);
      setGenerationStatus("running");

      let failed = false;

      try {
        for (const id of ids) {
          if (runId !== runIdRef.current || abortController.signal.aborted) {
            break;
          }

          const success = await generateSingleParagraph(id, runId, abortController.signal);
          if (runId !== runIdRef.current || abortController.signal.aborted) {
            break;
          }

          if (!success) {
            failed = true;
          }
        }

        if (runId !== runIdRef.current || abortController.signal.aborted) {
          return;
        }

        setGenerationStatus(failed ? "partial_error" : "completed");
      } finally {
        if (generationAbortControllerRef.current === abortController) {
          generationAbortControllerRef.current = null;
        }
      }
    },
    [generateSingleParagraph, setGenerationStatus, setGlobalError],
  );

  const cancelGeneration = useCallback((): void => {
    abortGeneration();
    setParagraphs((previous) => {
      const next = previous.map((paragraph) => recoverInterruptedParagraph(paragraph, "cancelled"));
      setGenerationStatus(buildGenerationStatus(next));
      return next;
    });
  }, [abortGeneration, setGenerationStatus, setParagraphs]);

  const generateParagraphBatch = useCallback(
    async (ids: string[]): Promise<void> => {
      if (ids.length === 0 || generationStatus === "running") {
        return;
      }
      if (!selectedModel) {
        setGlobalError("No model selected. Choose a voice preset to process.");
        return;
      }
      if (!isQwenReady) {
        setGlobalError("Qwen is not ready yet. Please wait a moment and try again.");
        return;
      }

      setSelectedParagraphIds(ids);
      await runQueue(ids);
    },
    [
      generationStatus,
      isQwenReady,
      runQueue,
      selectedModel,
      setGlobalError,
      setSelectedParagraphIds,
    ],
  );

  const generateAll = useCallback(async (): Promise<void> => {
    const ids = paragraphsRef.current
      .filter((item) => item.text.trim().length > 0)
      .map((item) => item.id);
    await generateParagraphBatch(ids);
  }, [generateParagraphBatch, paragraphsRef]);

  const generateFromParagraph = useCallback(
    async (paragraphId: string): Promise<void> => {
      const startIndex = paragraphsRef.current.findIndex((item) => item.id === paragraphId);
      if (startIndex < 0) {
        return;
      }

      const ids = paragraphsRef.current
        .slice(startIndex)
        .filter((item) => item.text.trim().length > 0)
        .map((item) => item.id);
      await generateParagraphBatch(ids);
    },
    [generateParagraphBatch, paragraphsRef],
  );

  const generateSelectedParagraphs = useCallback(async (): Promise<void> => {
    const selectedNonEmptyIds = paragraphsRef.current
      .filter((item) => orderedSelectedParagraphIds.includes(item.id) && item.text.trim().length > 0)
      .map((item) => item.id);
    await generateParagraphBatch(selectedNonEmptyIds);
  }, [generateParagraphBatch, orderedSelectedParagraphIds, paragraphsRef]);

  const retryParagraph = useCallback(
    async (id: string): Promise<void> => {
      if (!selectedModel || generationStatus === "running") {
        return;
      }

      const runId = Date.now();
      const abortController = new AbortController();
      runIdRef.current = runId;
      generationAbortControllerRef.current = abortController;
      setGenerationStatus("running");

      try {
        await generateSingleParagraph(id, runId, abortController.signal);
        if (runId === runIdRef.current && !abortController.signal.aborted) {
          setGenerationStatus(buildGenerationStatus(paragraphsRef.current));
        }
      } finally {
        if (generationAbortControllerRef.current === abortController) {
          generationAbortControllerRef.current = null;
        }
      }
    },
    [generateSingleParagraph, generationStatus, paragraphsRef, selectedModel, setGenerationStatus],
  );

  return {
    abortGeneration,
    cancelGeneration,
    generateAll,
    generateFromParagraph,
    generateSelectedParagraphs,
    retryParagraph,
  };
}
