import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { VoiceManagerDrawer } from "@/components/voice-manager-drawer";
import { exportPremierePackage, exportWav } from "@/features/export/exportAudio";
import { ExportMenu } from "@/features/export/ExportMenu";
import { Onboarding } from "@/features/onboarding/Onboarding";
import { ProjectsPanel, type DisplayProjectItem } from "@/features/projects/ProjectsPanel";
import {
  buildProjectContentSignature,
  buildProjectName,
  hasMeaningfulSessionData,
  sortProjectHistory,
  toHistoryItem,
  upsertHistoryItem,
} from "@/features/projects/projectSession";
import { formatBytes, formatDurationLabel } from "@/features/studio/formatters";
import {
  areParagraphTextsEqual,
  buildGenerationStatus,
  buildPresetModelItems,
  createId,
  hasParagraphAudio,
  normalizeGeneratingStatus,
  PRESET_MODEL_ID_PREFIX,
  recoverInterruptedParagraph,
  reconcileParagraphsFromTexts,
  splitTextIntoParagraphs,
} from "@/features/studio/paragraphModel";
import { ScriptWorkspace } from "@/features/studio/ScriptWorkspace";
import { TimelineFooter } from "@/features/studio/TimelineFooter";
import type {
  ExportKind,
  GenerationStatus,
  ModelItem,
  ParagraphItem,
  ProjectHistoryItem,
} from "@/features/studio/types";
import { VoiceRuntimePanel } from "@/features/studio/VoiceRuntimePanel";
import { useGenerationQueue } from "@/features/studio/useGenerationQueue";
import { useTimelinePlayback } from "@/features/studio/useTimelinePlayback";
import {
  createVoicePreset,
  deleteGeneratedAudioViaProxy,
  deleteVoicePreset,
  getQwenStatus,
  getVoicePresets,
  renameVoicePreset as renameVoicePresetApi,
  type QwenState,
  type VoicePreset,
} from "@/lib/apiClient";
import {
  deleteProject as deleteStoredProject,
  getProject,
  listProjects,
  renameProject as renameStoredProject,
  upsertProject,
  type StoredParagraph,
  type StoredProject,
} from "@/lib/projectsStore";
import {
  api as runtimeApi,
} from "@/shared/api/client";
import { useStudioStore } from "@/shared/state/studioStore";
const ACCEPTED_MODEL_EXTENSIONS = new Set([".pt", ".pth", ".bin"]);


function App() {
  const initialProjectTimestampRef = useRef<number>(Date.now());
  const runtime = useStudioStore((state) => state.runtime);
  const setRuntime = useStudioStore((state) => state.setRuntime);
  const [qwenState, setQwenState] = useState<QwenState | null>(null);
  const [runtimeBootError, setRuntimeBootError] = useState<string | null>(null);
  const [inputText, setInputText] = useState("");
  const [projects, setProjects] = useState<ProjectHistoryItem[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>(() => createId());
  const [activeProjectName, setActiveProjectName] = useState<string>(() =>
    buildProjectName(initialProjectTimestampRef.current),
  );
  const [isProjectsReady, setIsProjectsReady] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState("");
  const [voicePresets, setVoicePresets] = useState<VoicePreset[]>([]);
  const [models, setModels] = useState<ModelItem[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [paragraphs, setParagraphs] = useState<ParagraphItem[]>([]);
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>("idle");
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportingKind, setExportingKind] = useState<ExportKind | null>(null);
  const [activeParagraphId, setActiveParagraphId] = useState<string | null>(null);
  const [selectedParagraphIds, setSelectedParagraphIds] = useState<string[]>([]);
  const [isVoiceManagerOpen, setIsVoiceManagerOpen] = useState(false);

  const paragraphsRef = useRef<ParagraphItem[]>([]);
  const paragraphTextareaRefsRef = useRef<Map<string, HTMLTextAreaElement>>(new Map());
  const pendingParagraphFocusIdRef = useRef<string | null>(null);
  const pendingParagraphFocusIndexRef = useRef<number | null>(null);
  const paragraphSelectionAnchorIndexRef = useRef<number | null>(null);
  const activeProjectCreatedAtRef = useRef<number>(initialProjectTimestampRef.current);
  const hydratingProjectRef = useRef(false);
  const lastPersistedProjectSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadRuntime = async (): Promise<void> => {
      try {
        const nextRuntime = await runtimeApi.runtime();
        if (!active) {
          return;
        }
        setRuntime(nextRuntime);
        setRuntimeBootError(null);
      } catch (error) {
        if (!active) {
          return;
        }
        setRuntimeBootError(
          error instanceof Error ? error.message : "Unable to connect to the local backend.",
        );
      }
    };

    void loadRuntime();

    return () => {
      active = false;
    };
  }, [setRuntime]);

  const setParagraphTextareaRef = useCallback(
    (id: string, node: HTMLTextAreaElement | null): void => {
      if (node) {
        paragraphTextareaRefsRef.current.set(id, node);
        return;
      }

      paragraphTextareaRefsRef.current.delete(id);
    },
    [],
  );

  const applyPresetModels = useCallback((presets: VoicePreset[]): void => {
    setVoicePresets(presets);
    setModels((previous) => {
      const uploaded = previous.filter((item) => item.source === "uploaded");
      const presetModels = buildPresetModelItems(presets);
      return [...presetModels, ...uploaded];
    });
  }, []);

  const refreshVoicePresets = useCallback(async (): Promise<void> => {
    const presets = await getVoicePresets();
    applyPresetModels(presets);
  }, [applyPresetModels]);

  const applyModelToParagraphIds = useCallback(
    (ids: string[], modelId: string, baseSelectedModelId: string): void => {
      if (ids.length === 0) {
        return;
      }

      const idSet = new Set(ids);
      setParagraphs((previous) =>
        previous.map((item) =>
          idSet.has(item.id)
            ? {
                ...item,
                speakerModelId: modelId,
                speakerOverridden: modelId !== baseSelectedModelId,
                status: "pending" as const,
                error: undefined,
                audioUrl: undefined,
                audioBlob: undefined,
              }
            : item,
        ),
      );
    },
    [],
  );

  const onSelectVoicePreset = (voiceName: string): void => {
    const nextModelId = `${PRESET_MODEL_ID_PREFIX}${voiceName}`;
    setSelectedModelId(nextModelId);

    if (orderedSelectedParagraphIds.length > 1) {
      applyModelToParagraphIds(orderedSelectedParagraphIds, nextModelId, nextModelId);
    }
  };

  useEffect(() => {
    let active = true;

    void listProjects()
      .then((storedProjects) => {
        if (!active) {
          return;
        }
        setProjects(sortProjectHistory(storedProjects.map((project) => toHistoryItem(project))));
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setGlobalError("Unable to read project history from backend.");
      })
      .finally(() => {
        if (active) {
          setIsProjectsReady(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    paragraphsRef.current = paragraphs;
    setGenerationStatus(buildGenerationStatus(paragraphs));
  }, [paragraphs]);

  useEffect(() => {
    const focusId = pendingParagraphFocusIdRef.current;
    const focusIndex = pendingParagraphFocusIndexRef.current;
    if (!focusId && focusIndex === null) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const targetId = focusId ?? paragraphs[focusIndex ?? -1]?.id ?? null;
      const target = targetId ? paragraphTextareaRefsRef.current.get(targetId) : null;
      if (!target) {
        return;
      }

      target.focus();
      const cursorPosition = target.value.length;
      target.setSelectionRange(cursorPosition, cursorPosition);
      pendingParagraphFocusIdRef.current = null;
      pendingParagraphFocusIndexRef.current = null;
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [paragraphs]);

  useEffect(() => {
    if (!activeParagraphId) {
      return;
    }

    if (!paragraphs.some((paragraph) => paragraph.id === activeParagraphId)) {
      setActiveParagraphId(null);
    }
  }, [paragraphs, activeParagraphId]);

  useEffect(() => {
    setSelectedParagraphIds((previous) => {
      if (previous.length === 0) {
        return previous;
      }

      const availableIds = new Set(paragraphs.map((paragraph) => paragraph.id));
      const next = previous.filter((id) => availableIds.has(id));
      return next.length === previous.length ? previous : next;
    });
  }, [paragraphs]);

  useEffect(() => {
    let active = true;

    const loadDefaultVoices = async (): Promise<void> => {
      try {
        const presets = await getVoicePresets();
        if (active) {
          applyPresetModels(presets);
        }
      } catch {
        if (active) {
          setGlobalError("Unable to load voice presets from /voices.");
        }
      }
    };

    void loadDefaultVoices();

    return () => {
      active = false;
    };
  }, [applyPresetModels]);

  const selectedModel = useMemo(() => {
    if (models.length === 0) {
      return null;
    }

    return models.find((item) => item.id === selectedModelId) ?? models[0];
  }, [models, selectedModelId]);
  const isQwenReady = (qwenState?.status ?? "").toLowerCase() === "ready";
  const sidebarProjects = useMemo<DisplayProjectItem[]>(() => {
    const activeInHistory = projects.find((project) => project.id === activeProjectId);
    if (activeInHistory) {
      return projects;
    }

    return [
      {
        id: activeProjectId,
        name: activeProjectName,
        createdAt: activeProjectCreatedAtRef.current,
        updatedAt: Date.now(),
        isTransient: true,
      },
      ...projects,
    ];
  }, [projects, activeProjectId, activeProjectName]);

  const canGenerate =
    Boolean(selectedModel) &&
    paragraphs.some((paragraph) => paragraph.text.trim().length > 0) &&
    generationStatus !== "running";
  const selectedParagraphIdSet = useMemo(
    () => new Set(selectedParagraphIds),
    [selectedParagraphIds],
  );
  const orderedSelectedParagraphIds = useMemo(
    () =>
      paragraphs
        .filter((paragraph) => selectedParagraphIdSet.has(paragraph.id))
        .map((paragraph) => paragraph.id),
    [paragraphs, selectedParagraphIdSet],
  );
  const {
    clearActiveAudio,
    hasPlayableTimeline,
    isTimelinePlaying,
    isTimelineScrubbingRef,
    onParagraphPlaybackToggle,
    onTimelineScrubEnd,
    onTimelineScrubStart,
    onTimelineSeek,
    onTimelineToggle,
    playableParagraphIndexes,
    playingParagraphId,
    positionSec: timelinePositionSec,
    resetPlaybackState,
    setParagraphDurations,
    setPositionSec: setTimelinePositionSec,
    shouldResumeAfterSeekRef,
    timelineCurrentIndex,
    timelineCurrentParagraph,
    totalTimelineDuration,
  } = useTimelinePlayback({
    paragraphs,
    paragraphsRef,
    setActiveParagraphId,
  });
  const {
    abortGeneration,
    cancelGeneration: onCancelGeneration,
    generateAll: onGenerateAll,
    generateFromParagraph: onGenerateFromParagraph,
    generateSelectedParagraphs: onGenerateSelectedParagraphs,
    retryParagraph: onRetryParagraph,
  } = useGenerationQueue({
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
  });

  useEffect(() => {
    let active = true;

    const loadStatus = async (): Promise<void> => {
      try {
        const next = await getQwenStatus();
        if (active) {
          setQwenState(next);
        }
      } catch {
        if (active) {
          setQwenState({
            status: "error",
            launchedByApp: false,
            attempts: 0,
            startupElapsedMs: 0,
            apiUrl: "http://127.0.0.1:8000",
            lastError: "Could not connect to the local backend",
          });
        }
      }
    };

    void loadStatus();
    const interval = setInterval(() => {
      void loadStatus();
    }, 1500);

    return () => {
      active = false;
      clearInterval(interval);
      abortGeneration();
      clearActiveAudio();
    };
  }, [abortGeneration, clearActiveAudio]);

  useEffect(() => {
    if (models.length === 0) {
      if (selectedModelId) {
        setSelectedModelId("");
      }
      return;
    }

    const exists = models.some((model) => model.id === selectedModelId);
    if (!exists) {
      setSelectedModelId(models[0].id);
    }
  }, [models, selectedModelId]);

  useEffect(() => {
    if (!selectedModelId) {
      return;
    }

    setParagraphs((previous) => {
      let changed = false;
      const next = previous.map((item) => {
        if (item.speakerModelId) {
          return item;
        }

        changed = true;
        return {
          ...item,
          speakerModelId: selectedModelId,
          speakerOverridden: false,
        };
      });

      return changed ? next : previous;
    });
  }, [selectedModelId]);

  useEffect(() => {
    if (!isProjectsReady || !activeProjectId) {
      return;
    }

    if (!hasMeaningfulSessionData(inputText, paragraphs)) {
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      const currentSignature = buildProjectContentSignature(inputText, selectedModelId, paragraphs);
      if (currentSignature === lastPersistedProjectSignatureRef.current) {
        return;
      }

      const now = Date.now();
      const storedParagraphs: StoredParagraph[] = paragraphs.map((paragraph) => ({
        id: paragraph.id,
        text: paragraph.text,
        speakerModelId: paragraph.speakerModelId,
        speakerOverridden: paragraph.speakerOverridden,
        status: normalizeGeneratingStatus(paragraph.status, hasParagraphAudio(paragraph)),
        audioUrl: paragraph.audioUrl,
        error: paragraph.error,
      }));

      const payload: StoredProject = {
        id: activeProjectId,
        name: activeProjectName.trim() || buildProjectName(activeProjectCreatedAtRef.current),
        createdAt: activeProjectCreatedAtRef.current,
        updatedAt: now,
        inputText,
        selectedModelId,
        paragraphs: storedParagraphs,
      };

      void upsertProject(payload)
        .then(() => {
          if (cancelled) {
            return;
          }
          lastPersistedProjectSignatureRef.current = currentSignature;
          setProjects((previous) => upsertHistoryItem(previous, toHistoryItem(payload)));
        })
        .catch(() => {
          if (!cancelled) {
            setGlobalError("Unable to save project session to backend.");
          }
        });
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    isProjectsReady,
    activeProjectId,
    activeProjectName,
    inputText,
    paragraphs,
    selectedModelId,
  ]);

  const canExport =
    generationStatus !== "running" &&
    !isExporting &&
    paragraphs.length > 0 &&
    paragraphs.every((paragraph) => paragraph.status === "ok" && hasParagraphAudio(paragraph));

  const applyInputText = useCallback(
    (nextInput: string): void => {
      setInputText(nextInput);

      if (generationStatus === "running") {
        return;
      }

      const nextTexts = splitTextIntoParagraphs(nextInput);
      setParagraphs((previous) => {
        if (areParagraphTextsEqual(previous, nextTexts)) {
          return previous;
        }

        const next = reconcileParagraphsFromTexts(previous, nextTexts, selectedModelId);
        if (previous.length === 0 && next.length > 0) {
          pendingParagraphFocusIdRef.current = next[0].id;
          pendingParagraphFocusIndexRef.current = null;
        }
        return next;
      });
      setGlobalError(null);
    },
    [generationStatus, selectedModelId],
  );

  useEffect(() => {
    if (hydratingProjectRef.current) {
      hydratingProjectRef.current = false;
      return;
    }

    if (generationStatus === "running") {
      return;
    }

    const nextTexts = splitTextIntoParagraphs(inputText);
    setParagraphs((previous) => {
      if (areParagraphTextsEqual(previous, nextTexts)) {
        return previous;
      }

      return reconcileParagraphsFromTexts(previous, nextTexts, selectedModelId);
    });
  }, [inputText, generationStatus, selectedModelId]);

  const onCreateVoicePreset = async (payload: {
    name: string;
    transcript: string;
    file: File;
  }): Promise<void> => {
    const formData = new FormData();
    formData.append("name", payload.name);
    formData.append("ref_txt", payload.transcript);
    formData.append("audio", payload.file);
    await createVoicePreset(formData);
  };

  const onUploadVoiceModels = (files: File[]): void => {
    if (files.length === 0) {
      return;
    }

    const validFiles = files.filter((file) => {
      const lowerName = file.name.toLowerCase();
      for (const extension of ACCEPTED_MODEL_EXTENSIONS) {
        if (lowerName.endsWith(extension)) {
          return true;
        }
      }
      return false;
    });

    if (validFiles.length === 0) {
      setGlobalError("Only .pt, .pth, or .bin model files are allowed.");
      return;
    }

    setModels((previous) => {
      const signatures = new Set(
        previous
          .filter((item) => item.source === "uploaded")
          .map((item) => `${item.name}-${item.size}`),
      );

      const additions = validFiles
        .filter((file) => !signatures.has(`${file.name}-${file.size}`))
        .map<ModelItem>((file) => ({
          id: createId(),
          file,
          name: file.name,
          size: file.size,
          source: "uploaded",
        }));

      const merged = [...previous, ...additions];
      if (!selectedModelId && merged.length > 0) {
        setSelectedModelId(merged[0].id);
      }
      return merged;
    });
  };

  const onRenameVoicePreset = async (voiceName: string, newName: string): Promise<void> => {
    await renameVoicePresetApi(voiceName, newName);
  };

  const onDeleteVoicePreset = async (voiceName: string): Promise<void> => {
    await deleteVoicePreset(voiceName);
  };

  const onParagraphTextChange = (id: string, text: string): void => {
    const paragraphIndex = paragraphsRef.current.findIndex((item) => item.id === id);
    if (text.endsWith("\n") && paragraphIndex >= 0) {
      pendingParagraphFocusIdRef.current = null;
      pendingParagraphFocusIndexRef.current = paragraphIndex + 1;
    } else {
      pendingParagraphFocusIdRef.current = id;
      pendingParagraphFocusIndexRef.current = null;
    }

    const nextInput = paragraphsRef.current
      .map((item) => (item.id === id ? text : item.text))
      .join("\n");
    applyInputText(nextInput);
  };

  const onParagraphSpeakerChange = (id: string, modelId: string): void => {
    const shouldApplyToSelection =
      orderedSelectedParagraphIds.length > 1 && selectedParagraphIdSet.has(id);

    if (shouldApplyToSelection) {
      applyModelToParagraphIds(orderedSelectedParagraphIds, modelId, selectedModelId);
      return;
    }

    applyModelToParagraphIds([id], modelId, selectedModelId);
  };

  const onParagraphClick = (id: string, event: MouseEvent<HTMLTextAreaElement>): void => {
    const clickedIndex = paragraphsRef.current.findIndex((paragraph) => paragraph.id === id);
    if (clickedIndex === -1) {
      return;
    }

    const isToggleSelection = event.ctrlKey || event.metaKey;
    const isRangeSelection = event.shiftKey;
    const isMultiSelectionClick = selectedParagraphIds.length > 1 && selectedParagraphIdSet.has(id);
    const isSingleSelectionClick = selectedParagraphIds.length === 1 && selectedParagraphIdSet.has(id);

    if (isRangeSelection) {
      event.preventDefault();
      const anchor = paragraphSelectionAnchorIndexRef.current ?? clickedIndex;
      const [start, end] = anchor <= clickedIndex ? [anchor, clickedIndex] : [clickedIndex, anchor];
      const ids = paragraphsRef.current.slice(start, end + 1).map((paragraph) => paragraph.id);
      setSelectedParagraphIds(ids);
      return;
    }

    if (isToggleSelection) {
      event.preventDefault();
      setSelectedParagraphIds((previous) => {
        const exists = previous.includes(id);
        if (exists) {
          return previous.filter((selectedId) => selectedId !== id);
        }
        return [...previous, id];
      });
      paragraphSelectionAnchorIndexRef.current = clickedIndex;
      return;
    }

    if (isMultiSelectionClick) {
      setSelectedParagraphIds([id]);
      paragraphSelectionAnchorIndexRef.current = clickedIndex;
    } else if (!isMultiSelectionClick) {
      if (isSingleSelectionClick) {
        setSelectedParagraphIds([]);
        paragraphSelectionAnchorIndexRef.current = null;
      } else {
        setSelectedParagraphIds([id]);
        paragraphSelectionAnchorIndexRef.current = clickedIndex;
      }
    }

    event.currentTarget.select();
  };

  const onParagraphContextMenu = (id: string, event: MouseEvent<HTMLElement>): void => {
    event.preventDefault();

    const clickedIndex = paragraphsRef.current.findIndex((paragraph) => paragraph.id === id);
    if (clickedIndex === -1) {
      return;
    }

    if (!selectedParagraphIdSet.has(id)) {
      setSelectedParagraphIds([id]);
      paragraphSelectionAnchorIndexRef.current = clickedIndex;
    }

    setActiveParagraphId(id);
  };

  const onCreateNewProject = (): void => {
    const timestamp = Date.now();
    abortGeneration();
    resetPlaybackState();
    setGlobalError(null);
    setInputText("");
    setParagraphs([]);
    setSelectedParagraphIds([]);
    paragraphSelectionAnchorIndexRef.current = null;
    setGenerationStatus("idle");
    activeProjectCreatedAtRef.current = timestamp;
    lastPersistedProjectSignatureRef.current = null;
    setActiveProjectId(createId());
    setActiveProjectName(buildProjectName(timestamp));
  };

  const onOpenProject = async (projectId: string): Promise<void> => {
    try {
      const project = await getProject(projectId);
      if (!project) {
        return;
      }

      abortGeneration();
      resetPlaybackState();
      hydratingProjectRef.current = true;

      const hydratedParagraphs: ParagraphItem[] = project.paragraphs.map((paragraph) =>
        recoverInterruptedParagraph(
          {
            id: paragraph.id,
            text: paragraph.text,
            speakerModelId: paragraph.speakerModelId,
            speakerOverridden: paragraph.speakerOverridden,
            status: paragraph.status,
            audioUrl: paragraph.audioUrl,
            audioBlob: paragraph.audioUrl ? undefined : paragraph.audioBlob,
            error: paragraph.error,
          },
          "restored",
        ),
      );

      setInputText(project.inputText);
      setParagraphs(hydratedParagraphs);
      setSelectedParagraphIds([]);
      paragraphSelectionAnchorIndexRef.current = null;
      setSelectedModelId(project.selectedModelId);
      setGenerationStatus(buildGenerationStatus(hydratedParagraphs));
      setGlobalError(null);
      setActiveProjectId(project.id);
      setActiveProjectName(project.name);
      activeProjectCreatedAtRef.current = project.createdAt;
      lastPersistedProjectSignatureRef.current = buildProjectContentSignature(
        project.inputText,
        project.selectedModelId,
        hydratedParagraphs,
      );
    } catch {
      setGlobalError("Unable to open the selected project.");
    }
  };

  const onRenameProject = (projectId: string): void => {
    const current = sidebarProjects.find((project) => project.id === projectId);
    if (!current) {
      return;
    }
    setEditingProjectId(projectId);
    setEditingProjectName(current.name);
  };

  const onCommitProjectRename = async (projectId: string): Promise<void> => {
    const current = sidebarProjects.find((project) => project.id === projectId);
    const nextName = editingProjectName.trim();
    setEditingProjectId(null);
    setEditingProjectName("");

    if (!current || !nextName || nextName === current.name) {
      return;
    }

    if (current.isTransient) {
      if (projectId === activeProjectId) {
        setActiveProjectName(nextName);
      }
      return;
    }

    try {
      const renamed = await renameStoredProject(projectId, nextName);
      if (!renamed) {
        return;
      }

      if (projectId === activeProjectId) {
        setActiveProjectName(nextName);
      }

      setProjects((previous) => upsertHistoryItem(previous, toHistoryItem(renamed)));
    } catch {
      setGlobalError("Unable to rename project.");
    }
  };

  const onDeleteProject = async (projectId: string): Promise<void> => {
    const current = sidebarProjects.find((project) => project.id === projectId);
    if (!current) {
      return;
    }

    const accepted = window.confirm(`Delete "${current.name}"?`);
    if (!accepted) {
      return;
    }

    if (current.isTransient) {
      if (projectId === activeProjectId) {
        onCreateNewProject();
      }
      return;
    }

    try {
      const stored = await getProject(projectId);
      const linkedAudioUrls = Array.from(
        new Set(
          (stored?.paragraphs ?? [])
            .map((paragraph) => paragraph.audioUrl)
            .filter((url): url is string => Boolean(url)),
        ),
      );

      await Promise.all(
        linkedAudioUrls.map(async (url) => {
          try {
            await deleteGeneratedAudioViaProxy(url);
          } catch {
            // Best effort cleanup; some files may no longer exist upstream.
          }
        }),
      );

      await deleteStoredProject(projectId);
      setProjects((previous) => previous.filter((project) => project.id !== projectId));

      if (projectId === activeProjectId) {
        onCreateNewProject();
      }
    } catch {
      setGlobalError("Unable to delete project.");
    }
  };

  const onExportWav = async (): Promise<void> => {
    if (!canExport) {
      return;
    }

    setIsExporting(true);
    setExportingKind("wav");
    setGlobalError(null);

    try {
      await exportWav(paragraphsRef.current);
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : "Error exporting final audio.");
    } finally {
      setIsExporting(false);
      setExportingKind(null);
    }
  };

  const onExportPremierePackage = async (): Promise<void> => {
    if (!canExport) {
      return;
    }

    setIsExporting(true);
    setExportingKind("premiere");
    setGlobalError(null);

    try {
      await exportPremierePackage({
        activeProjectName,
        models,
        paragraphs: paragraphsRef.current,
      });
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : "Error exporting Premiere package.");
    } finally {
      setIsExporting(false);
      setExportingKind(null);
    }
  };

  if (runtimeBootError && !runtime) {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-6 text-foreground">
        <Alert variant="destructive" className="max-w-xl">
          <AlertTitle>Backend unavailable</AlertTitle>
          <AlertDescription>{runtimeBootError}</AlertDescription>
        </Alert>
      </main>
    );
  }

  if (!runtime) {
    return (
      <main className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">
        Starting VoiceStudio Pro...
      </main>
    );
  }

  if (runtime.status !== "ready") {
    return <Onboarding runtime={runtime} />;
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen grid-cols-1 md:grid-cols-[320px_1fr]">
        <aside className="border-r border-border/80 bg-sidebar p-4 md:sticky md:top-0 md:h-screen md:overflow-y-auto md:p-5">
          <div className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">VoiceStudio</p>
              <h1 className="mt-1 text-xl font-semibold">TTS Editor</h1>
            </div>

            <ProjectsPanel
              projects={sidebarProjects}
              activeProjectId={activeProjectId}
              editingProjectId={editingProjectId}
              editingProjectName={editingProjectName}
              isReady={isProjectsReady}
              onCreateProject={onCreateNewProject}
              onOpenProject={(projectId) => void onOpenProject(projectId)}
              onRenameProject={onRenameProject}
              onCommitProjectRename={(projectId) => void onCommitProjectRename(projectId)}
              onDeleteProject={(projectId) => void onDeleteProject(projectId)}
              onEditingProjectNameChange={setEditingProjectName}
              onCancelRename={() => {
                setEditingProjectId(null);
                setEditingProjectName("");
              }}
            />

            <VoiceRuntimePanel
              selectedModel={selectedModel}
              qwenState={qwenState}
              formatBytes={formatBytes}
              onOpenVoiceManager={() => setIsVoiceManagerOpen(true)}
            />
          </div>
        </aside>

        <section className="flex min-h-screen flex-col">
          <header className="sticky top-0 z-20 flex items-center justify-end border-b border-border/80 bg-background/95 px-4 py-3 backdrop-blur md:px-6">
            <ExportMenu
              canExport={canExport}
              exportingKind={exportingKind}
              isExporting={isExporting}
              onExportWav={() => void onExportWav()}
              onExportPremierePackage={() => void onExportPremierePackage()}
            />
          </header>

          <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-5 pb-28 md:px-6">
            {globalError ? (
              <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{globalError}</AlertDescription>
              </Alert>
            ) : null}

            <ScriptWorkspace
              activeParagraphId={activeParagraphId}
              canGenerate={canGenerate}
              generationStatus={generationStatus}
              inputText={inputText}
              models={models}
              orderedSelectedParagraphIds={orderedSelectedParagraphIds}
              paragraphs={paragraphs}
              playingParagraphId={playingParagraphId}
              selectedModel={selectedModel}
              selectedModelId={selectedModelId}
              selectedParagraphIdSet={selectedParagraphIdSet}
              applyInputText={applyInputText}
              hasParagraphAudio={hasParagraphAudio}
              onCancelGeneration={onCancelGeneration}
              onGenerateAll={() => void onGenerateAll()}
              onGenerateFromParagraph={(paragraphId) => void onGenerateFromParagraph(paragraphId)}
              onGenerateSelectedParagraphs={() => void onGenerateSelectedParagraphs()}
              onParagraphClick={onParagraphClick}
              onParagraphContextMenu={onParagraphContextMenu}
              onParagraphPlaybackToggle={onParagraphPlaybackToggle}
              onParagraphSpeakerChange={onParagraphSpeakerChange}
              onParagraphTextChange={onParagraphTextChange}
              onRetryParagraph={(paragraphId) => void onRetryParagraph(paragraphId)}
              setActiveParagraphId={setActiveParagraphId}
              setParagraphTextareaRef={setParagraphTextareaRef}
            />
          </div>

          <TimelineFooter
            currentIndex={timelineCurrentIndex}
            currentParagraph={timelineCurrentParagraph}
            hasPlayableTimeline={hasPlayableTimeline}
            isPlaying={isTimelinePlaying}
            playableCount={playableParagraphIndexes.length}
            positionSec={timelinePositionSec}
            totalDuration={totalTimelineDuration}
            formatDurationLabel={formatDurationLabel}
            onPositionPreview={setTimelinePositionSec}
            onScrubEnd={onTimelineScrubEnd}
            onScrubStart={onTimelineScrubStart}
            onSeekCommit={onTimelineSeek}
            onToggle={onTimelineToggle}
            shouldResumeAfterSeekRef={shouldResumeAfterSeekRef}
            isTimelineScrubbingRef={isTimelineScrubbingRef}
          />
        </section>
      </div>
      <VoiceManagerDrawer
        isOpen={isVoiceManagerOpen}
        isQwenReady={isQwenReady}
        voices={voicePresets}
        selectedVoiceModelId={selectedModelId}
        onSelectVoicePreset={onSelectVoicePreset}
        onClose={() => setIsVoiceManagerOpen(false)}
        onRefresh={refreshVoicePresets}
        onUploadModels={onUploadVoiceModels}
        onCreate={onCreateVoicePreset}
        onRename={onRenameVoicePreset}
        onDelete={onDeleteVoicePreset}
      />
    </main>
  );
}

export default App;













