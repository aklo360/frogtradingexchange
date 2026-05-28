"use client";

import { usePathname } from "next/navigation";
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
  const pathname = usePathname();
  const [muted, setMuted] = useState(false);
  const audioEnabled = pathname !== "/airdrop";

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
      {audioEnabled ? <BackgroundAudio muted={muted} /> : null}
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
