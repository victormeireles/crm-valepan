import { listActiveQuickReplies } from "@/app/actions/message-templates";
import type { MessageTemplateDTO } from "@/lib/inbox/quick-replies";

let cachedActiveQuickReplies: MessageTemplateDTO[] | null = null;
let cachedActiveQuickRepliesPromise: Promise<MessageTemplateDTO[]> | null = null;

export function peekActiveQuickRepliesCache() {
  return cachedActiveQuickReplies;
}

export function invalidateActiveQuickRepliesCache() {
  cachedActiveQuickReplies = null;
  cachedActiveQuickRepliesPromise = null;
}

export function loadActiveQuickReplies() {
  if (cachedActiveQuickReplies) return Promise.resolve(cachedActiveQuickReplies);
  if (!cachedActiveQuickRepliesPromise) {
    cachedActiveQuickRepliesPromise = listActiveQuickReplies().then((result) => {
      const templates = result.ok ? result.templates : [];
      cachedActiveQuickReplies = templates;
      return templates;
    });
  }
  return cachedActiveQuickRepliesPromise;
}
