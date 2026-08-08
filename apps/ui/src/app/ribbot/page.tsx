import { Suspense } from "react";

import { RibbotControlClient } from "./RibbotControlClient";
import styles from "./ribbot.module.css";

export default function RibbotControlPage() {
  return (
    <Suspense
      fallback={
        <main className={styles.page}>
          <section className={styles.panel}>Loading Ribbot</section>
        </main>
      }
    >
      <RibbotControlClient />
    </Suspense>
  );
}
