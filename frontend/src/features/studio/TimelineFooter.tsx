import type { MutableRefObject } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import type { ParagraphItem } from "./types";

type TimelineFooterProps = {
  currentIndex: number | null;
  currentParagraph: ParagraphItem | null;
  hasPlayableTimeline: boolean;
  isPlaying: boolean;
  playableCount: number;
  positionSec: number;
  totalDuration: number;
  formatDurationLabel: (seconds: number) => string;
  onPositionPreview: (position: number) => void;
  onScrubEnd: () => void;
  onScrubStart: () => void;
  onSeekCommit: (position: number, shouldResume: boolean) => void;
  onToggle: () => void;
  shouldResumeAfterSeekRef: MutableRefObject<boolean>;
  isTimelineScrubbingRef: MutableRefObject<boolean>;
};

export function TimelineFooter({
  currentIndex,
  currentParagraph,
  hasPlayableTimeline,
  isPlaying,
  playableCount,
  positionSec,
  totalDuration,
  formatDurationLabel,
  onPositionPreview,
  onScrubEnd,
  onScrubStart,
  onSeekCommit,
  onToggle,
  shouldResumeAfterSeekRef,
  isTimelineScrubbingRef,
}: TimelineFooterProps) {
  const maxDuration = Math.max(totalDuration, 0);

  return (
    <footer className="fixed right-0 bottom-0 left-0 z-30 border-t border-border/80 bg-background/95 backdrop-blur md:left-[320px]">
      <div className="mx-auto w-full max-w-5xl px-4 py-3 md:px-6">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center">
          <div />
          <div className="flex justify-center">
            <Button
              size="sm"
              variant="outline"
              disabled={!hasPlayableTimeline}
              onClick={onToggle}
              className="size-11 rounded-full p-0"
              aria-label={isPlaying ? "Pause timeline" : "Play timeline"}
            >
              {isPlaying ? <Pause className="size-5" /> : <Play className="size-5" />}
            </Button>
          </div>
          <p className="text-right text-xs text-muted-foreground">
            {currentParagraph
              ? `Paragraph ${currentIndex !== null ? currentIndex + 1 : ""}`
              : `${playableCount} clip${playableCount === 1 ? "" : "s"}`}
          </p>
        </div>

        <div className="mt-2 flex items-center gap-3">
          <span className="w-10 text-xs tabular-nums text-muted-foreground">
            {formatDurationLabel(positionSec)}
          </span>
          <Slider
            min={0}
            max={maxDuration}
            step={0.01}
            value={[Math.min(positionSec, maxDuration)]}
            onValueChange={(nextValue) => {
              const next = nextValue[0] ?? 0;
              onPositionPreview(Math.max(0, Math.min(next, totalDuration)));
            }}
            onValueCommitted={(nextValue) => {
              const shouldResume = shouldResumeAfterSeekRef.current;
              shouldResumeAfterSeekRef.current = false;
              isTimelineScrubbingRef.current = false;
              onSeekCommit(nextValue[0] ?? 0, shouldResume);
            }}
            onScrubStart={onScrubStart}
            onScrubEnd={onScrubEnd}
            disabled={!hasPlayableTimeline || totalDuration <= 0}
            aria-label="Timeline seek"
          />
          <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
            {formatDurationLabel(totalDuration)}
          </span>
        </div>
      </div>
    </footer>
  );
}
