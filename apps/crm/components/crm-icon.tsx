import type { SVGProps } from "react";

export type CrmIconName =
  | "add"
  | "add_task"
  | "archive"
  | "bakery_dining"
  | "block"
  | "call"
  | "chat"
  | "check"
  | "check_box"
  | "check_box_outline_blank"
  | "close"
  | "contact_page"
  | "conversion_path"
  | "event"
  | "event_busy"
  | "expand_more"
  | "flag"
  | "history"
  | "hourglass_bottom"
  | "inventory_2"
  | "keep"
  | "mark_chat_unread"
  | "mood"
  | "more_horiz"
  | "progress_activity"
  | "schedule"
  | "search"
  | "send"
  | "task_alt"
  | "videocam";

function IconDrawing({ name }: { name: CrmIconName }) {
  switch (name) {
    case "add":
      return <path d="M12 5v14M5 12h14" />;
    case "add_task":
      return <><path d="M9 5h6M9 3h6v4H9zM7 5H5v16h10" /><path d="m8 14 2.2 2.2L15 11.5M19 13v6m-3-3h6" /></>;
    case "archive":
      return <><path d="M4 8h16v12H4zM3 4h18v4H3zM9 12h6" /></>;
    case "bakery_dining":
      return <><path d="M4 14a8 8 0 0 1 16 0v5H4zM8 13l1-3m3 3V9m4 4-1-3" /></>;
    case "block":
      return <><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></>;
    case "call":
      return <path d="M7.2 3.5 10 8 8.2 9.8a14 14 0 0 0 6 6L16 14l4.5 2.8-.8 3.2c-.2.8-1 1.3-1.8 1.2C10.2 20 4 13.8 2.8 6.1c-.1-.8.4-1.6 1.2-1.8z" />;
    case "chat":
      return <path d="M4 5h16v12H9l-5 4z" />;
    case "check":
      return <path d="m5 12 4 4L19 6" />;
    case "check_box":
      return <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="m7.5 12 3 3 6-6" /></>;
    case "check_box_outline_blank":
      return <rect x="4" y="4" width="16" height="16" rx="2" />;
    case "close":
      return <path d="M6 6l12 12M18 6 6 18" />;
    case "contact_page":
      return <><path d="M6 3h9l4 4v14H6zM15 3v5h4" /><circle cx="11" cy="12" r="2" /><path d="M8 18a3 3 0 0 1 6 0" /></>;
    case "conversion_path":
      return <><circle cx="6" cy="5" r="2" /><circle cx="18" cy="19" r="2" /><path d="M6 7v4a3 3 0 0 0 3 3h6a3 3 0 0 1 3 3" /></>;
    case "event":
      return <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 10h18" /></>;
    case "event_busy":
      return <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 10h18M9 14l5 5m0-5-5 5" /></>;
    case "expand_more":
      return <path d="m6 9 6 6 6-6" />;
    case "flag":
      return <path d="M5 21V4m0 1h11l-1.5 3L16 11H5" />;
    case "history":
      return <><path d="M4 5v5h5M4.8 9A8 8 0 1 1 6 17" /><path d="M12 8v4l3 2" /></>;
    case "hourglass_bottom":
      return <><path d="M7 3h10M7 21h10M8 3c0 4 1 6 4 9-3 3-4 5-4 9m8-18c0 4-1 6-4 9 3 3 4 5 4 9" /><path d="M9.5 18h5L12 15z" /></>;
    case "inventory_2":
      return <><path d="M4 8h16v13H4zM3 4h18v4H3zM9 12h6" /></>;
    case "keep":
      return <><path d="M8 3h8l-1 6 3 3H6l3-3zM12 12v9" /></>;
    case "mark_chat_unread":
      return <><path d="M4 6h11a5 5 0 0 0 5 5v6H9l-5 4z" /><circle cx="18" cy="5" r="3" fill="currentColor" stroke="none" /></>;
    case "mood":
      return <><circle cx="12" cy="12" r="9" /><path d="M8.5 10h.01M15.5 10h.01M8 14c1 2 2.3 3 4 3s3-1 4-3" /></>;
    case "more_horiz":
      return <><circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" /></>;
    case "progress_activity":
      return <path d="M12 3a9 9 0 0 1 9 9M12 21a9 9 0 0 1-9-9" />;
    case "schedule":
      return <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>;
    case "search":
      return <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></>;
    case "send":
      return <path d="m3 4 18 8-18 8 3-8zm3 8h15" />;
    case "task_alt":
      return <><path d="M20 11a8 8 0 1 1-4-7" /><path d="m8 11 3 3 9-9" /></>;
    case "videocam":
      return <><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10 5-3v10l-5-3" /></>;
  }
}

export function CrmIcon({
  name,
  className,
  ...props
}: { name: CrmIconName; className?: string } & Omit<SVGProps<SVGSVGElement>, "children" | "name">) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={props["aria-label"] ? undefined : true}
      focusable="false"
      {...props}
    >
      <IconDrawing name={name} />
    </svg>
  );
}
