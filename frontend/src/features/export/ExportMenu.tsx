import { ChevronDown, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ExportKind = "wav" | "premiere";

type ExportMenuProps = {
  canExport: boolean;
  exportingKind: ExportKind | null;
  isExporting: boolean;
  onExportWav: () => void;
  onExportPremierePackage: () => void;
};

export function ExportMenu({
  canExport,
  exportingKind,
  isExporting,
  onExportWav,
  onExportPremierePackage,
}: ExportMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button disabled={!canExport}>
          {isExporting ? <Loader2 className="animate-spin" /> : <Download />}
          {exportingKind === "premiere"
            ? "Exporting package"
            : exportingKind === "wav"
              ? "Exporting WAV"
              : "Export"}
          <ChevronDown className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Export options</DropdownMenuLabel>
        <DropdownMenuItem onSelect={onExportWav}>WAV final mix</DropdownMenuItem>
        <DropdownMenuItem onSelect={onExportPremierePackage}>
          Premiere XML + audio clips ZIP
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
