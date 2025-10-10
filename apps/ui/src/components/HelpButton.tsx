"use client";

import styles from "./HelpChatButtons.module.css";

export const HelpButton = () => {
  return (
    <button
      type="button"
      className={`${styles.btn} ${styles.helpBtn}`}
      aria-label="Help"
    >
      <img src="/info.svg" alt="" className={`${styles.icon} ${styles.helpIcon}`} />
    </button>
  );
};
