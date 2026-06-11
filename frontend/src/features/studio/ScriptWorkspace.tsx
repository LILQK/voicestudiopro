import { type MouseEvent } from "react";
import { Loader2, Pause, Play, RefreshCcw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SpeakerAvatar } from "@/components/ui/speaker-avatar";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { GenerationStatus, ModelItem, ParagraphItem, ParagraphStatus } from "./types";

const paragraphStripClass: Record<ParagraphStatus, string> = {
  pending: "bg-muted-foreground/35",
  generating: "bg-muted-foreground/55",
  ok: "bg-blue-500",
  error: "bg-destructive",
};

type ScriptWorkspaceProps = {
  activeParagraphId: string | null;
  canGenerate: boolean;
  generationStatus: GenerationStatus;
  inputText: string;
  models: ModelItem[];
  orderedSelectedParagraphIds: string[];
  paragraphs: ParagraphItem[];
  playingParagraphId: string | null;
  selectedModel: ModelItem | null;
  selectedModelId: string;
  selectedParagraphIdSet: Set<string>;
  applyInputText: (nextInput: string) => void;
  hasParagraphAudio: (paragraph: ParagraphItem) => boolean;
  onCancelGeneration: () => void;
  onGenerateAll: () => void;
  onGenerateFromParagraph: (paragraphId: string) => void;
  onGenerateSelectedParagraphs: () => void;
  onParagraphClick: (id: string, event: MouseEvent<HTMLTextAreaElement>) => void;
  onParagraphContextMenu: (id: string, event: MouseEvent<HTMLElement>) => void;
  onParagraphPlaybackToggle: (paragraph: ParagraphItem) => void;
  onParagraphSpeakerChange: (id: string, modelId: string) => void;
  onParagraphTextChange: (id: string, text: string) => void;
  onRetryParagraph: (id: string) => void;
  setActiveParagraphId: (id: string | null) => void;
  setParagraphTextareaRef: (id: string, node: HTMLTextAreaElement | null) => void;
};

export function ScriptWorkspace({
  activeParagraphId,
  canGenerate,
  generationStatus,
  inputText,
  models,
  orderedSelectedParagraphIds,
  paragraphs,
  playingParagraphId,
  selectedModel,
  selectedModelId,
  selectedParagraphIdSet,
  applyInputText,
  hasParagraphAudio,
  onCancelGeneration,
  onGenerateAll,
  onGenerateFromParagraph,
  onGenerateSelectedParagraphs,
  onParagraphClick,
  onParagraphContextMenu,
  onParagraphPlaybackToggle,
  onParagraphSpeakerChange,
  onParagraphTextChange,
  onRetryParagraph,
  setActiveParagraphId,
  setParagraphTextareaRef,
}: ScriptWorkspaceProps) {
  return (
    <div className="space-y-3 border-0">
      <div className="flex justify-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Button onClick={onGenerateAll} disabled={!canGenerate}>
                {generationStatus === "running" ? <Loader2 className="animate-spin" /> : <Play />}
                Process
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {!selectedModel
              ? "No model selected. Choose a voice preset to process."
              : "Generate audio for every paragraph."}
          </TooltipContent>
        </Tooltip>
        {generationStatus === "running" ? (
          <Button variant="outline" onClick={onCancelGeneration}>
            <Square />
            Cancel
          </Button>
        ) : null}
      </div>

      <div>
        {paragraphs.length === 0 ? (
          <Textarea
            className="min-h-56 resize-none border-0 bg-transparent px-0 shadow-none outline-none focus-visible:ring-0"
            placeholder="Start typing or paste text here... paragraphs appear as you write."
            value={inputText}
            onChange={(event) => applyInputText(event.target.value)}
            disabled={generationStatus === "running"}
          />
        ) : (
          <div className="ml-8 space-y-1 pr-1">
            {paragraphs.map((item) => {
              const isSelected = selectedParagraphIdSet.has(item.id);
              const hasMultiSelectionContext = isSelected && orderedSelectedParagraphIds.length > 1;

              return (
                <Popover
                  key={item.id}
                  open={activeParagraphId === item.id}
                  onOpenChange={(open: boolean) => {
                    if (open) {
                      setActiveParagraphId(item.id);
                    } else if (activeParagraphId === item.id) {
                      setActiveParagraphId(null);
                    }
                  }}
                >
                  <article
                    className={`relative pl-4 pr-1 ${
                      hasMultiSelectionContext
                        ? "rounded-md border border-sky-300/70 bg-sky-100/70"
                        : isSelected
                          ? "rounded-md bg-muted/40"
                          : ""
                    }`}
                    onContextMenu={(event) => onParagraphContextMenu(item.id, event)}
                  >
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        aria-hidden
                        tabIndex={-1}
                        className="pointer-events-none absolute right-4 top-3 h-0 w-0 opacity-0"
                      />
                    </PopoverTrigger>
                    <PopoverContent side="top" align="end" className="w-auto">
                      {hasMultiSelectionContext ? (
                        <div className="space-y-2">
                          <p className="text-xs text-muted-foreground">
                            {orderedSelectedParagraphIds.length} paragraphs selected
                          </p>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={generationStatus === "running" || !selectedModel}
                            onClick={onGenerateSelectedParagraphs}
                          >
                            <RefreshCcw />
                            Regenerate selection
                          </Button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!hasParagraphAudio(item)}
                            onClick={() => onParagraphPlaybackToggle(item)}
                          >
                            {playingParagraphId === item.id ? <Pause /> : <Play />}
                            {playingParagraphId === item.id ? "Pause" : "Play"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={generationStatus === "running" || !selectedModel}
                            onClick={() => onRetryParagraph(item.id)}
                          >
                            <RefreshCcw />
                            Retry
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={generationStatus === "running" || !selectedModel}
                            onClick={() => onGenerateFromParagraph(item.id)}
                          >
                            <Play />
                            Generate from here
                          </Button>
                          {!hasParagraphAudio(item) ? (
                            <span className="text-xs text-muted-foreground">No audio</span>
                          ) : null}
                        </div>
                      )}
                    </PopoverContent>

                    <div className="absolute -left-8 top-1/2 z-10 -translate-y-1/2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            disabled={generationStatus === "running" || models.length === 0}
                            className="rounded-full p-0 transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
                            aria-label="Change paragraph speaker"
                          >
                            <SpeakerAvatar
                              className="size-6 text-[9px]"
                              name={
                                models.find((model) => model.id === item.speakerModelId)?.name ??
                                selectedModel?.name ??
                                "Voice"
                              }
                            />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent side="right" align="start" className="w-56">
                          <DropdownMenuLabel className="text-xs text-muted-foreground">
                            Paragraph speaker
                          </DropdownMenuLabel>
                          <DropdownMenuRadioGroup
                            value={
                              models.some((model) => model.id === item.speakerModelId)
                                ? item.speakerModelId
                                : selectedModel?.id ?? ""
                            }
                            onValueChange={(nextValue: string) =>
                              onParagraphSpeakerChange(item.id, nextValue)
                            }
                          >
                            {models.map((model) => (
                              <DropdownMenuRadioItem key={model.id} value={model.id}>
                                {model.name}
                              </DropdownMenuRadioItem>
                            ))}
                          </DropdownMenuRadioGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <span
                      className={`pointer-events-none absolute bottom-1 left-0 top-1 w-[3px] rounded-full ${paragraphStripClass[item.status]}`}
                      aria-hidden
                    />
                    {item.status === "generating" ? (
                      <Loader2 className="absolute -left-4 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                    ) : null}

                    <Textarea
                      ref={(node) => setParagraphTextareaRef(item.id, node)}
                      className={`min-h-6 resize-none border-0 bg-transparent py-0 pr-5 pl-7 leading-6 shadow-none outline-none selection:bg-sky-200 selection:text-foreground focus-visible:ring-0 ${
                        generationStatus === "running" && item.status === "ok" ? "cursor-pointer" : ""
                      }`}
                      value={item.text}
                      disabled={generationStatus === "running" && item.status !== "ok"}
                      readOnly={generationStatus === "running" && item.status === "ok"}
                      onChange={(event) => onParagraphTextChange(item.id, event.target.value)}
                      onClick={(event) => onParagraphClick(item.id, event)}
                    />
                    {item.error ? <p className="mt-1 text-xs text-destructive">{item.error}</p> : null}
                  </article>
                </Popover>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
