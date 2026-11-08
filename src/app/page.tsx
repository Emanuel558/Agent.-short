import { Suspense } from "react";
import { Workspace } from "@/components/workspace";
export default function Home() {
  return (
    <Suspense fallback={<main className="boot">Opening your workspace…</main>}>
      <Workspace />
    </Suspense>
  );
}
