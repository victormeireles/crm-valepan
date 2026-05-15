"use client";

import { updateTaskAssignee } from "@/app/actions/tasks";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function LeadTaskAssigneeSelect({
  taskId,
  assigneeId,
  teamOptions,
}: {
  taskId: string;
  assigneeId: string | null;
  teamOptions: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [value, setValue] = useState(assigneeId ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setValue(assigneeId ?? "");
  }, [assigneeId]);

  async function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value.trim();
    const assigneeNext = next.length === 0 ? null : next;
    setBusy(true);
    const res = await updateTaskAssignee({ taskId, assigneeId: assigneeNext });
    setBusy(false);
    if (!res.ok) {
      setValue(assigneeId ?? "");
      return;
    }
    setValue(assigneeNext ?? "");
    router.refresh();
  }

  return (
    <select
      value={value}
      disabled={busy}
      onChange={(e) => void onChange(e)}
      className="max-w-[10rem] shrink-0 truncate rounded border border-[var(--border)] bg-[var(--background)] px-1 py-0.5 text-[11px]"
      title="Responsável pela tarefa"
    >
      <option value="">Não atribuído</option>
      {teamOptions.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
