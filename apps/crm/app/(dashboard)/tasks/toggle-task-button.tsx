"use client";

import { toggleTaskDone } from "@/app/actions/tasks";
import { CrmIcon } from "@/components/crm-icon";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ToggleTaskButton({
  taskId,
  done,
  className,
  iconOnly = false,
  itemLabel = "tarefa",
}: {
  taskId: string;
  done: boolean;
  className?: string;
  iconOnly?: boolean;
  itemLabel?: "tarefa" | "follow-up";
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onClick() {
    setLoading(true);
    const result = await toggleTaskDone(taskId, !done);
    setLoading(false);
    if (!result.ok) {
      window.alert(result.error ?? `Não foi possível atualizar o ${itemLabel}.`);
      return;
    }
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={loading}
      aria-label={done ? `Reabrir ${itemLabel}` : `Concluir ${itemLabel}`}
      className={
        className ??
        "rounded-md border border-[var(--border)] bg-[var(--vp-paper-pure)] px-2 py-1 text-xs font-medium hover:bg-[var(--background)] disabled:opacity-50"
      }
    >
      {iconOnly ? (
        <CrmIcon
          name={loading ? "progress_activity" : done ? "check_box" : "check_box_outline_blank"}
          className={`text-lg ${loading ? "animate-spin" : ""}`}
        />
      ) : loading ? "…" : done
        ? itemLabel === "follow-up" ? "Reabrir follow-up" : "Reabrir"
        : itemLabel === "follow-up" ? "Concluir follow-up" : "Concluir"}
    </button>
  );
}
