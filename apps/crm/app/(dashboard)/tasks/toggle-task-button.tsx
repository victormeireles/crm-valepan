"use client";

import { toggleTaskDone } from "@/app/actions/tasks";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ToggleTaskButton({
  taskId,
  done,
  className,
  iconOnly = false,
}: {
  taskId: string;
  done: boolean;
  className?: string;
  iconOnly?: boolean;
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
      aria-label={done ? "Reabrir tarefa" : "Concluir tarefa"}
      className={
        className ??
        "rounded-md border border-[var(--border)] bg-[var(--vp-paper-pure)] px-2 py-1 text-xs font-medium hover:bg-[var(--background)] disabled:opacity-50"
      }
    >
      {iconOnly ? (
        <span className="material-symbols-outlined text-lg" aria-hidden="true">
          {loading ? "progress_activity" : done ? "check_box" : "check_box_outline_blank"}
        </span>
      ) : loading ? "…" : done ? "Reabrir" : "Concluir"}
    </button>
  );
}
