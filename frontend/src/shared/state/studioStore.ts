import { create } from "zustand";
import type { RuntimeState } from "../api/client";

type StudioState = {
  runtime: RuntimeState | null;
  setRuntime: (runtime: RuntimeState) => void;
};

export const useStudioStore = create<StudioState>((set) => ({
  runtime: null,
  setRuntime: (runtime) => set({ runtime }),
}));
