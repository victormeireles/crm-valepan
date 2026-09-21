"use client";

import { MarkConversationRead } from "@/app/(dashboard)/inbox/mark-conversation-read";
import { ChatThread } from "@/app/(dashboard)/inbox/chat-thread";
import { SendMessageForm } from "@/app/(dashboard)/inbox/send-message-form";
import type { InboxConversationView } from "@/app/actions/inbox";

export function PipelineConversationBody({ view }: { view: InboxConversationView }) {
  const conversation = view.conversation;
  return (
    <>
      <MarkConversationRead
        conversationId={conversation.id}
        fingerprint={`${conversation.lastSentAt ?? ""}|${conversation.lastDirection ?? ""}|${conversation.lastBodyPreview ?? ""}`}
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--vp-paper)] px-4">
        <ChatThread
          key={conversation.id}
          conversationId={conversation.id}
          initialMessages={view.messages}
          hasMoreOlder={view.hasMoreOlder}
          messagesLoadError={view.messagesLoadError}
          lastReadAtIso={conversation.lastReadAt}
        />
      </div>
      <div className="shrink-0 border-t border-[var(--vp-ink-line)] bg-[var(--vp-paper)] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <SendMessageForm
          key={conversation.id}
          conversationId={conversation.id}
          phone={conversation.phone}
          firstName={conversation.firstName}
          compact
        />
      </div>
    </>
  );
}
