"use client";

import { toggleTaskDone } from "@/app/actions/tasks";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ToggleTaskButton({
  taskId,
  done,
  className,
}: {
  taskId: string;
  done: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onClick() {
    setLoading(true);
    await toggleTaskDone(taskId, !done);
    setLoading(false);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={loading}
      className={
        className ??
        "rounded-md border border-[var(--border)] bg-[var(--vp-paper-pure)] px-2 py-1 text-xs font-medium hover:bg-[var(--background)] disabled:opacity-50"
      }
    >
      {loading ? "…" : done ? "Reabrir" : "Concluir"}
    </button>
  );
}
