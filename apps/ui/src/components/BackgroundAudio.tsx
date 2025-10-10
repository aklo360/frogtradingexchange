"use client";

import { useEffect, useRef } from "react";

type Props = {
  muted: boolean;
};

export const BackgroundAudio = ({ muted }: Props) => {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.loop = true;
    audio.volume = 0.35;

    const attemptPlay = () => {
      audio
        .play()
        .catch(() => {
          /* autoplay blocked until user gesture */
        });
    };

    attemptPlay();

    const unlock = () => {
      attemptPlay();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };

    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = muted;
    if (!muted) {
      void audio.play().catch(() => {
        /* ignore */
      });
    }
  }, [muted]);

  return (
    <audio
      ref={audioRef}
      src="/bgmusic.mp3"
      preload="auto"
      muted={muted}
      aria-hidden="true"
    />
  );
};
