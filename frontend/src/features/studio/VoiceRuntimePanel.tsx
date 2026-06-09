import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { QwenState } from "@/lib/apiClient";

type SelectedModel = {
  name: string;
  size: number;
  source: "preset" | "uploaded";
} | null;

type VoiceRuntimePanelProps = {
  selectedModel: SelectedModel;
  qwenState: QwenState | null;
  formatBytes: (bytes: number) => string;
  onOpenVoiceManager: () => void;
};

export function VoiceRuntimePanel({
  selectedModel,
  qwenState,
  formatBytes,
  onOpenVoiceManager,
}: VoiceRuntimePanelProps) {
  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Voice model</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between font-normal"
            onClick={onOpenVoiceManager}
          >
            <span className="truncate">{selectedModel?.name ?? "Select voice model"}</span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Button>
          {selectedModel ? (
            <div className="rounded-md border border-border/80 bg-muted/60 p-2 text-xs">
              <p className="font-medium">Active: {selectedModel.name}</p>
              <p className="text-muted-foreground">
                {formatBytes(selectedModel.size)} ·{" "}
                {selectedModel.source === "preset" ? "Preset" : "Uploaded"}
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No voices found in `/voices`. Open the voice panel to create one.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Qwen status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span>Status</span>
            <Badge variant={qwenState?.status === "ready" ? "default" : "secondary"}>
              {qwenState?.status ?? "loading"}
            </Badge>
          </div>
          <p className="text-muted-foreground">{qwenState?.apiUrl ?? "python://runtime"}</p>
          {qwenState?.lastError ? <p className="text-destructive">{qwenState.lastError}</p> : null}
        </CardContent>
      </Card>
    </>
  );
}
