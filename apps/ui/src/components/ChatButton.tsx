"use client";

import styles from "./HelpChatButtons.module.css";

export const ChatButton = () => {
  return (
    <button
      type="button"
      className={`${styles.btn} ${styles.chatBtn}`}
      aria-label="Chat"
    >
      <img src="/chat.svg" alt="" className={styles.icon} />
    </button>
  );
};
