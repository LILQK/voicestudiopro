import { MoreHorizontal, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

export type DisplayProjectItem = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  isTransient?: boolean;
};

type ProjectsPanelProps = {
  projects: DisplayProjectItem[];
  activeProjectId: string;
  editingProjectId: string | null;
  editingProjectName: string;
  isReady: boolean;
  onCreateProject: () => void;
  onOpenProject: (projectId: string) => void;
  onRenameProject: (projectId: string) => void;
  onCommitProjectRename: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onEditingProjectNameChange: (name: string) => void;
  onCancelRename: () => void;
};

export function ProjectsPanel({
  projects,
  activeProjectId,
  editingProjectId,
  editingProjectName,
  isReady,
  onCreateProject,
  onOpenProject,
  onRenameProject,
  onCommitProjectRename,
  onDeleteProject,
  onEditingProjectNameChange,
  onCancelRename,
}: ProjectsPanelProps) {
  return (
    <Card className="gap-0">
      <CardHeader className="pb-1">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm">Projects</CardTitle>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onCreateProject}
            aria-label="Create new project"
          >
            <Plus />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-1">
          {!isReady ? (
            <p className="text-xs text-muted-foreground">Loading project history...</p>
          ) : projects.length === 0 ? (
            <p className="text-xs text-muted-foreground">No saved projects yet.</p>
          ) : (
            projects.map((project) => (
              <div
                key={project.id}
                className="group/item flex items-center gap-1 transition-colors hover:bg-muted/50"
              >
                <button
                  type="button"
                  onClick={() => onOpenProject(project.id)}
                  className="min-w-0 flex-1 py-1.5 text-left"
                >
                  {editingProjectId === project.id ? (
                    <Input
                      value={editingProjectName}
                      autoFocus
                      className="h-8"
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => onEditingProjectNameChange(event.target.value)}
                      onBlur={() => onCommitProjectRename(project.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          onCommitProjectRename(project.id);
                        }
                        if (event.key === "Escape") {
                          onCancelRename();
                        }
                      }}
                    />
                  ) : (
                    <p
                      className={`line-clamp-1 text-sm ${
                        project.id === activeProjectId
                          ? "inline-block -ml-2 rounded-md bg-muted px-2 py-0.5 font-semibold text-foreground"
                          : "font-normal text-foreground/85"
                      }`}
                    >
                      {project.name}
                    </p>
                  )}
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="mr-1 size-7 shrink-0 opacity-0 transition-opacity group-hover/item:opacity-100 group-focus-within/item:opacity-100"
                      aria-label={`Project actions for ${project.name}`}
                    >
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem onSelect={() => onRenameProject(project.id)}>
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => onDeleteProject(project.id)}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
