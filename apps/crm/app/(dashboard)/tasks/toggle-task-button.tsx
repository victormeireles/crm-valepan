"use client";

import { toggleTaskDone } from "@/app/actions/tasks";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ToggleTaskButton({ taskId, done }: { taskId: string; done: boolean }) {
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
      className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--background)] disabled:opacity-50"
    >
      {done ? "Reabrir" : "Concluir"}
    </button>
  );
}
