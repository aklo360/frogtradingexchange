"use client";

import styles from "./SpeakerToggle.module.css";

type Props = {
  muted: boolean;
  onToggle: (muted: boolean) => void;
  className?: string;
};

export const SpeakerToggle = ({ muted, onToggle, className }: Props) => {
  return (
    <button
      type="button"
      className={`${styles.toggle} ${className ?? ""}`}
      onClick={() => onToggle(!muted)}
      aria-label={muted ? "Unmute background music" : "Mute background music"}
    >
      <span className={styles.iconWrap} aria-hidden="true">
        <img
          src={muted ? "/mute.svg" : "/sound.svg"}
          alt=""
          className={`${styles.icon} ${muted ? styles.iconMuted : ""}`}
        />
      </span>
    </button>
  );
};
