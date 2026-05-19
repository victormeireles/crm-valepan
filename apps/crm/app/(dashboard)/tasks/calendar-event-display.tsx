"use client";

import { calendarEventLines, type CalendarEventDTO } from "@/lib/calendar-events";

export function CalendarEventLinesDisplay({
  ev,
  compact,
  showFunnelMark,
}: {
  ev: CalendarEventDTO;
  compact?: boolean;
  showFunnelMark?: boolean;
}) {
  const { taskTitle, lead, company } = calendarEventLines(ev);
  const sub = compact ? "text-[10px]" : "text-xs";

  return (
    <>
      <span
        className={`block truncate font-medium leading-tight ${ev.done ? "line-through" : ""}`}
      >
        {showFunnelMark ? "◎ " : ""}
        {taskTitle}
      </span>
      {lead ? (
        <span className={`block truncate leading-tight opacity-85 ${sub}`}>{lead}</span>
      ) : null}
      {company ? (
        <span className={`block truncate leading-tight opacity-70 ${sub}`}>{company}</span>
      ) : null}
    </>
  );
}
