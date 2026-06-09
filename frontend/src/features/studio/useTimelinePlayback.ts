import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { buildAudioProxyUrl } from "@/lib/apiClient";
import { getParagraphAudioSource, hasParagraphAudio } from "./paragraphModel";
import type { ParagraphItem } from "./types";

type UseTimelinePlaybackParams = {
  paragraphs: ParagraphItem[];
  paragraphsRef: MutableRefObject<ParagraphItem[]>;
  setActiveParagraphId: Dispatch<SetStateAction<string | null>>;
};

export function useTimelinePlayback({
  paragraphs,
  paragraphsRef,
  setActiveParagraphId,
}: UseTimelinePlaybackParams) {
  const [playingParagraphId, setPlayingParagraphId] = useState<string | null>(null);
  const [paragraphDurations, setParagraphDurations] = useState<Record<string, number>>({});
  const [timelinePositionSec, setTimelinePositionSec] = useState(0);
  const [isTimelinePlaying, setIsTimelinePlaying] = useState(false);
  const [timelineCurrentIndex, setTimelineCurrentIndex] = useState<number | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentAudioCleanupRef = useRef<(() => void) | null>(null);
  const durationCacheRef = useRef<WeakMap<Blob, number>>(new WeakMap());
  const durationByUrlCacheRef = useRef<Map<string, number>>(new Map());
  const playbackSourceRef = useRef<"manual" | "timeline" | null>(null);
  const seekRequestIdRef = useRef(0);
  const shouldResumeAfterSeekRef = useRef(false);
  const isTimelineScrubbingRef = useRef(false);
  const timelinePlayingRef = useRef(false);

  const playableParagraphIndexes = useMemo(
    () =>
      paragraphs.reduce<number[]>((acc, paragraph, index) => {
        if (paragraph.status === "ok" && hasParagraphAudio(paragraph)) {
          acc.push(index);
        }
        return acc;
      }, []),
    [paragraphs],
  );

  const timelineSegments = useMemo(() => {
    let cursor = 0;
    return playableParagraphIndexes.map((paragraphIndex) => {
      const paragraph = paragraphs[paragraphIndex];
      const duration = Math.max(paragraphDurations[paragraph?.id ?? ""] ?? 0, 0);
      const segment = {
        paragraphIndex,
        paragraphId: paragraph?.id ?? "",
        start: cursor,
        end: cursor + duration,
        duration,
      };
      cursor += duration;
      return segment;
    });
  }, [playableParagraphIndexes, paragraphs, paragraphDurations]);

  const timelineSegmentByParagraphIndex = useMemo(() => {
    const map = new Map<number, (typeof timelineSegments)[number]>();
    for (const segment of timelineSegments) {
      map.set(segment.paragraphIndex, segment);
    }
    return map;
  }, [timelineSegments]);

  const totalTimelineDuration =
    timelineSegments.length > 0 ? timelineSegments[timelineSegments.length - 1].end : 0;
  const hasPlayableTimeline = playableParagraphIndexes.length > 0;
  const timelineCurrentParagraph =
    timelineCurrentIndex !== null ? paragraphs[timelineCurrentIndex] ?? null : null;

  const releaseCurrentAudioSource = useCallback((): void => {
    currentAudioCleanupRef.current?.();
    currentAudioCleanupRef.current = null;
  }, []);

  const clearActiveAudio = useCallback((): void => {
    seekRequestIdRef.current += 1;
    setPlayingParagraphId(null);

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.onloadedmetadata = null;
      audioRef.current = null;
    }

    releaseCurrentAudioSource();
  }, [releaseCurrentAudioSource]);

  const findNextPlayableIndex = useCallback(
    (startIndex: number): number => {
      for (let index = startIndex; index < paragraphsRef.current.length; index += 1) {
        const candidate = paragraphsRef.current[index];
        if (candidate?.status === "ok" && hasParagraphAudio(candidate)) {
          return index;
        }
      }

      return -1;
    },
    [paragraphsRef],
  );

  const playTimelineFrom = useCallback(
    (startIndex: number): void => {
      const targetIndex = findNextPlayableIndex(startIndex);

      if (targetIndex === -1) {
        setIsTimelinePlaying(false);
        setTimelineCurrentIndex(null);
        playbackSourceRef.current = null;
        return;
      }

      const target = paragraphsRef.current[targetIndex];
      const targetSource = target ? getParagraphAudioSource(target) : null;
      if (!targetSource || !target) {
        setIsTimelinePlaying(false);
        return;
      }

      const segment = timelineSegmentByParagraphIndex.get(targetIndex);
      const baseOffset = segment?.start ?? 0;

      clearActiveAudio();

      const audio = new Audio(targetSource.src);
      audioRef.current = audio;
      currentAudioCleanupRef.current = targetSource.cleanup ?? null;
      playbackSourceRef.current = "timeline";
      setTimelineCurrentIndex(targetIndex);
      setActiveParagraphId(target.id);
      setPlayingParagraphId(target.id);
      setTimelinePositionSec(baseOffset);
      setIsTimelinePlaying(true);

      audio.onended = () => {
        setPlayingParagraphId(null);
        releaseCurrentAudioSource();

        if (audioRef.current === audio) {
          audioRef.current = null;
        }

        if (playbackSourceRef.current !== "timeline" || !timelinePlayingRef.current) {
          return;
        }

        playTimelineFrom(targetIndex + 1);
      };

      audio.onerror = () => {
        setPlayingParagraphId(null);
        releaseCurrentAudioSource();

        if (audioRef.current === audio) {
          audioRef.current = null;
        }

        if (playbackSourceRef.current === "timeline" && timelinePlayingRef.current) {
          playTimelineFrom(targetIndex + 1);
        }
      };

      void audio.play().catch(() => {
        setPlayingParagraphId(null);
        setIsTimelinePlaying(false);
      });
    },
    [
      clearActiveAudio,
      findNextPlayableIndex,
      paragraphsRef,
      releaseCurrentAudioSource,
      setActiveParagraphId,
      timelineSegmentByParagraphIndex,
    ],
  );

  const resetPlaybackState = useCallback((): void => {
    clearActiveAudio();
    playbackSourceRef.current = null;
    shouldResumeAfterSeekRef.current = false;
    isTimelineScrubbingRef.current = false;
    setPlayingParagraphId(null);
    setActiveParagraphId(null);
    setParagraphDurations({});
    setIsTimelinePlaying(false);
    setTimelineCurrentIndex(null);
    setTimelinePositionSec(0);
  }, [clearActiveAudio, setActiveParagraphId]);

  const onTimelineSeek = useCallback(
    (requested: number, forceResume = false): void => {
      if (!Number.isFinite(requested) || timelineSegments.length === 0) {
        return;
      }

      const clamped = Math.max(0, Math.min(requested, totalTimelineDuration));
      setTimelinePositionSec(clamped);

      const targetSegment =
        timelineSegments.find((segment) => clamped <= segment.end) ??
        timelineSegments[timelineSegments.length - 1];
      if (!targetSegment) {
        return;
      }

      const targetParagraph = paragraphsRef.current[targetSegment.paragraphIndex];
      const targetSource = targetParagraph ? getParagraphAudioSource(targetParagraph) : null;
      if (!targetParagraph || !targetSource) {
        return;
      }

      const currentAudio = audioRef.current;
      const wasPlaying =
        forceResume ||
        (playbackSourceRef.current === "timeline" && isTimelinePlaying) ||
        (playbackSourceRef.current === "timeline" && currentAudio !== null && !currentAudio.paused);
      const offsetInSegment = Math.max(0, clamped - targetSegment.start);

      clearActiveAudio();

      const audio = new Audio(targetSource.src);
      const seekRequestId = seekRequestIdRef.current;
      audioRef.current = audio;
      currentAudioCleanupRef.current = targetSource.cleanup ?? null;
      playbackSourceRef.current = "timeline";
      setTimelineCurrentIndex(targetSegment.paragraphIndex);
      setActiveParagraphId(targetParagraph.id);
      setPlayingParagraphId(wasPlaying ? targetParagraph.id : null);
      setIsTimelinePlaying(wasPlaying);

      audio.onended = () => {
        setPlayingParagraphId(null);
        releaseCurrentAudioSource();

        if (audioRef.current === audio) {
          audioRef.current = null;
        }

        if (playbackSourceRef.current !== "timeline" || !timelinePlayingRef.current) {
          return;
        }

        playTimelineFrom(targetSegment.paragraphIndex + 1);
      };

      audio.onerror = () => {
        setPlayingParagraphId(null);
        releaseCurrentAudioSource();

        if (audioRef.current === audio) {
          audioRef.current = null;
        }
      };

      const applyOffset = (): void => {
        const seekTarget = Math.max(0, Math.min(offsetInSegment, Math.max((audio.duration || 0) - 0.01, 0)));
        if (!Number.isFinite(seekTarget)) {
          return;
        }

        try {
          audio.currentTime = seekTarget;
        } catch {
          // Ignore browser-level seek errors while metadata loads.
        }
      };

      audio.onloadedmetadata = () => {
        if (audioRef.current !== audio || seekRequestId !== seekRequestIdRef.current) {
          return;
        }

        applyOffset();
        if (wasPlaying) {
          void audio.play().catch(() => {
            setPlayingParagraphId(null);
            setIsTimelinePlaying(false);
          });
        }
      };

      if (!wasPlaying) {
        applyOffset();
      }
    },
    [
      clearActiveAudio,
      isTimelinePlaying,
      paragraphsRef,
      playTimelineFrom,
      releaseCurrentAudioSource,
      setActiveParagraphId,
      timelineSegments,
      totalTimelineDuration,
    ],
  );

  const onTimelineScrubStart = useCallback((): void => {
    isTimelineScrubbingRef.current = true;

    const audio = audioRef.current;
    const isTimelineAudioActive = playbackSourceRef.current === "timeline" && Boolean(audio);
    const wasPlaying = isTimelineAudioActive && audio !== null && !audio.paused;

    shouldResumeAfterSeekRef.current = wasPlaying;
    if (wasPlaying && audio) {
      audio.pause();
      setPlayingParagraphId(null);
      setIsTimelinePlaying(false);
    }
  }, []);

  const onTimelineScrubEnd = useCallback((): void => {
    // Keep locked until onValueCommitted runs; fallback unlock below covers cancellations.
    window.setTimeout(() => {
      if (isTimelineScrubbingRef.current) {
        isTimelineScrubbingRef.current = false;
      }
    }, 50);
  }, []);

  const onTimelineToggle = useCallback((): void => {
    if (isTimelinePlaying) {
      if (playbackSourceRef.current === "timeline" && audioRef.current) {
        audioRef.current.pause();
      }
      setPlayingParagraphId(null);
      setIsTimelinePlaying(false);
      return;
    }

    if (
      playbackSourceRef.current === "timeline" &&
      audioRef.current &&
      audioRef.current.paused &&
      timelineCurrentIndex !== null
    ) {
      const currentParagraph = paragraphsRef.current[timelineCurrentIndex];
      setPlayingParagraphId(currentParagraph?.id ?? null);
      setIsTimelinePlaying(true);
      void audioRef.current.play().catch(() => {
        setPlayingParagraphId(null);
        setIsTimelinePlaying(false);
      });
      return;
    }

    const startIndex = timelineCurrentIndex ?? 0;
    playTimelineFrom(startIndex);
  }, [isTimelinePlaying, paragraphsRef, playTimelineFrom, timelineCurrentIndex]);

  const onPlay = useCallback(
    (item: ParagraphItem): void => {
      const source = getParagraphAudioSource(item);
      if (!source) {
        return;
      }

      const itemIndex = paragraphsRef.current.findIndex((paragraph) => paragraph.id === item.id);

      clearActiveAudio();
      playbackSourceRef.current = "manual";
      setIsTimelinePlaying(false);
      setTimelineCurrentIndex(itemIndex >= 0 ? itemIndex : null);
      if (itemIndex >= 0) {
        const segment = timelineSegmentByParagraphIndex.get(itemIndex);
        setTimelinePositionSec(segment?.start ?? 0);
      }

      const audio = new Audio(source.src);
      audioRef.current = audio;
      currentAudioCleanupRef.current = source.cleanup ?? null;
      setActiveParagraphId(item.id);
      setPlayingParagraphId(item.id);

      audio.onended = () => {
        setPlayingParagraphId(null);
        releaseCurrentAudioSource();

        if (audioRef.current === audio) {
          audioRef.current = null;
        }
      };

      audio.onerror = () => {
        setPlayingParagraphId(null);
        releaseCurrentAudioSource();
      };

      void audio.play().catch(() => {
        setPlayingParagraphId(null);
      });
    },
    [
      clearActiveAudio,
      paragraphsRef,
      releaseCurrentAudioSource,
      setActiveParagraphId,
      timelineSegmentByParagraphIndex,
    ],
  );

  const onParagraphPlaybackToggle = useCallback(
    (item: ParagraphItem): void => {
      if (!hasParagraphAudio(item)) {
        return;
      }

      const selectedTimelineParagraph =
        timelineCurrentIndex !== null ? paragraphsRef.current[timelineCurrentIndex] : null;
      const isCurrentAudioItem =
        selectedTimelineParagraph?.id === item.id &&
        playbackSourceRef.current !== null &&
        Boolean(audioRef.current);

      if (isCurrentAudioItem && audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
        setPlayingParagraphId(null);
        if (playbackSourceRef.current === "timeline") {
          setIsTimelinePlaying(false);
        }
        return;
      }

      if (isCurrentAudioItem && audioRef.current && audioRef.current.paused) {
        setPlayingParagraphId(item.id);
        if (playbackSourceRef.current === "timeline") {
          setIsTimelinePlaying(true);
        }
        void audioRef.current.play().catch(() => {
          setPlayingParagraphId(null);
          if (playbackSourceRef.current === "timeline") {
            setIsTimelinePlaying(false);
          }
        });
        return;
      }

      onPlay(item);
    },
    [onPlay, paragraphsRef, timelineCurrentIndex],
  );

  useEffect(() => {
    timelinePlayingRef.current = isTimelinePlaying;
  }, [isTimelinePlaying]);

  useEffect(() => {
    return () => {
      clearActiveAudio();
    };
  }, [clearActiveAudio]);

  useEffect(() => {
    let cancelled = false;

    const playableParagraphs = paragraphs.filter(
      (paragraph) => paragraph.status === "ok" && hasParagraphAudio(paragraph),
    );

    if (playableParagraphs.length === 0) {
      setParagraphDurations((previous) => (Object.keys(previous).length === 0 ? previous : {}));
      return;
    }

    const knownIds = new Set(playableParagraphs.map((paragraph) => paragraph.id));
    setParagraphDurations((previous) => {
      const nextEntries = Object.entries(previous).filter(([id]) => knownIds.has(id));
      const next = Object.fromEntries(nextEntries);
      const previousKeys = Object.keys(previous);
      const nextKeys = Object.keys(next);
      const isSame =
        previousKeys.length === nextKeys.length &&
        nextKeys.every((key) => previous[key] === next[key]);
      return isSame ? previous : next;
    });

    const pending = playableParagraphs.filter((paragraph) => paragraphDurations[paragraph.id] === undefined);
    if (pending.length === 0) {
      return;
    }

    const readDuration = async (paragraph: ParagraphItem): Promise<number> => {
      if (paragraph.audioUrl) {
        const cached = durationByUrlCacheRef.current.get(paragraph.audioUrl);
        if (cached !== undefined) {
          return cached;
        }

        const audio = new Audio();
        audio.preload = "metadata";
        audio.src = buildAudioProxyUrl(paragraph.audioUrl);
        const duration = await new Promise<number>((resolve) => {
          const done = (value: number) => {
            audio.onloadedmetadata = null;
            audio.onerror = null;
            resolve(Number.isFinite(value) && value > 0 ? value : 0);
          };

          audio.onloadedmetadata = () => done(audio.duration);
          audio.onerror = () => done(0);
        });

        durationByUrlCacheRef.current.set(paragraph.audioUrl, duration);
        return duration;
      }

      const blob = paragraph.audioBlob;
      if (!blob) {
        return 0;
      }

      const cached = durationCacheRef.current.get(blob);
      if (cached !== undefined) {
        return cached;
      }

      const objectUrl = URL.createObjectURL(blob);
      const audio = new Audio();
      audio.preload = "metadata";
      audio.src = objectUrl;

      const duration = await new Promise<number>((resolve) => {
        const done = (value: number) => {
          audio.onloadedmetadata = null;
          audio.onerror = null;
          URL.revokeObjectURL(objectUrl);
          resolve(Number.isFinite(value) && value > 0 ? value : 0);
        };

        audio.onloadedmetadata = () => done(audio.duration);
        audio.onerror = () => done(0);
      });

      durationCacheRef.current.set(blob, duration);
      return duration;
    };

    void Promise.all(
      pending.map(async (paragraph) => {
        const duration = await readDuration(paragraph);
        return { id: paragraph.id, duration };
      }),
    ).then((results) => {
      if (cancelled) {
        return;
      }

      setParagraphDurations((previous) => {
        const next = { ...previous };
        for (const item of results) {
          next[item.id] = item.duration;
        }
        const previousKeys = Object.keys(previous);
        const nextKeys = Object.keys(next);
        const isSame =
          previousKeys.length === nextKeys.length &&
          nextKeys.every((key) => previous[key] === next[key]);
        return isSame ? previous : next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [paragraphs, paragraphDurations]);

  useEffect(() => {
    if (hasPlayableTimeline) {
      return;
    }

    if (playbackSourceRef.current === "timeline") {
      clearActiveAudio();
      playbackSourceRef.current = null;
    }

    setIsTimelinePlaying(false);
    setTimelineCurrentIndex(null);
    setTimelinePositionSec(0);
  }, [clearActiveAudio, hasPlayableTimeline]);

  useEffect(() => {
    if (timelineCurrentIndex === null) {
      return;
    }

    const syncPosition = (): void => {
      if (isTimelineScrubbingRef.current) {
        return;
      }

      const audio = audioRef.current;
      const segment = timelineSegmentByParagraphIndex.get(timelineCurrentIndex);
      if (!audio || !segment) {
        return;
      }

      const nextPosition = Math.min(totalTimelineDuration, segment.start + audio.currentTime);
      setTimelinePositionSec(nextPosition);
    };

    syncPosition();
    const intervalId = window.setInterval(syncPosition, 120);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [timelineCurrentIndex, timelineSegmentByParagraphIndex, totalTimelineDuration]);

  return {
    clearActiveAudio,
    hasPlayableTimeline,
    isTimelinePlaying,
    isTimelineScrubbingRef,
    onParagraphPlaybackToggle,
    onTimelineScrubEnd,
    onTimelineScrubStart,
    onTimelineSeek,
    onTimelineToggle,
    paragraphDurations,
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
  };
}
