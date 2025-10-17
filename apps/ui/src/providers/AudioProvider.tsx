"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { BackgroundAudio } from "@/components/BackgroundAudio";

type AudioContextValue = {
  muted: boolean;
  setMuted: (muted: boolean) => void;
  toggleMuted: () => void;
};

const AudioContext = createContext<AudioContextValue | undefined>(undefined);

export const AudioProvider = ({ children }: { children: ReactNode }) => {
  const [muted, setMuted] = useState(false);

  const toggleMuted = useCallback(() => {
    setMuted((prev) => !prev);
  }, []);

  const value = useMemo<AudioContextValue>(
    () => ({
      muted,
      setMuted,
      toggleMuted,
    }),
    [muted, toggleMuted],
  );

  return (
    <AudioContext.Provider value={value}>
      <BackgroundAudio muted={muted} />
      {children}
    </AudioContext.Provider>
  );
};

export const useAudio = (): AudioContextValue => {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error("useAudio must be used within AudioProvider");
  }
  return context;
};

