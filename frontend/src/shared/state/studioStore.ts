import { create } from "zustand";
import type { Paragraph, RuntimeState, VoicePreset } from "../api/client";
import { createId, splitTextIntoParagraphs } from "../utils/text";

type StudioState = {
  runtime: RuntimeState | null;
  voices: VoicePreset[];
  selectedVoiceId: string | null;
  text: string;
  paragraphs: Paragraph[];
  activeAudioUrl: string | null;
  setRuntime: (runtime: RuntimeState) => void;
  setVoices: (voices: VoicePreset[]) => void;
  selectVoice: (voiceId: string | null) => void;
  setText: (text: string) => void;
  segmentText: () => void;
  updateParagraph: (id: string, patch: Partial<Paragraph>) => void;
  setParagraphs: (paragraphs: Paragraph[]) => void;
  setActiveAudioUrl: (url: string | null) => void;
};

export const useStudioStore = create<StudioState>((set, get) => ({
  runtime: null,
  voices: [],
  selectedVoiceId: null,
  text: "",
  paragraphs: [],
  activeAudioUrl: null,
  setRuntime: (runtime) => set({ runtime }),
  setVoices: (voices) =>
    set((state) => ({
      voices,
      selectedVoiceId: state.selectedVoiceId ?? voices[0]?.id ?? null,
    })),
  selectVoice: (voiceId) => set({ selectedVoiceId: voiceId }),
  setText: (text) => set({ text }),
  segmentText: () => {
    const { text, selectedVoiceId } = get();
    const paragraphs = splitTextIntoParagraphs(text).map((item) => ({
      id: createId(),
      text: item,
      voice_id: selectedVoiceId,
      status: "pending" as const,
    }));
    set({ paragraphs });
  },
  updateParagraph: (id, patch) =>
    set((state) => ({
      paragraphs: state.paragraphs.map((paragraph) =>
        paragraph.id === id ? { ...paragraph, ...patch } : paragraph,
      ),
    })),
  setParagraphs: (paragraphs) => set({ paragraphs }),
  setActiveAudioUrl: (activeAudioUrl) => set({ activeAudioUrl }),
}));

