import { Suspense } from "react";
import { PrivyProofPanel } from "@/components/PrivyProofPanel";

export default function PrivyProofPage() {
  return (
    <Suspense fallback={null}>
      <PrivyProofPanel />
    </Suspense>
  );
}
