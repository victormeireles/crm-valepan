"use client";

import { deleteTask } from "@/app/actions/tasks";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteTaskButton({
  taskId,
  title,
  className,
}: {
  taskId: string;
  title: string;
  className?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onClick() {
    if (!confirm(`Excluir a tarefa «${title}»? Esta ação não pode ser desfeita.`)) return;
    setLoading(true);
    setErr(null);
    const res = await deleteTask(taskId);
    setLoading(false);
    if (!res.ok) {
      setErr(res.error ?? "Erro ao excluir.");
      return;
    }
    router.refresh();
  }

  return (
    <span className="inline-flex flex-col items-stretch gap-0.5">
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={loading}
        className={
          className
            ? `${className} !text-[var(--vp-error)] hover:!border-[color:var(--vp-error)]`
            : "rounded-md border border-transparent px-2 py-1 text-xs text-[var(--vp-error)] hover:border-[var(--border)] hover:bg-[var(--background)] disabled:opacity-50"
        }
      >
        {loading ? "…" : "Excluir"}
      </button>
      {err ? <span className="text-[10px] text-[var(--vp-error)]">{err}</span> : null}
    </span>
  );
}
