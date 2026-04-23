/**
 * Chat em altura fixa (viewport − header − padding do shell), com scroll só dentro
 * da lista e da área de mensagens — evita scroll da página inteira.
 */
export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex max-h-[calc(100dvh-var(--header-height)-3rem)] min-h-0 flex-1 flex-col overflow-hidden md:max-h-[calc(100dvh-var(--header-height)-4rem)]">
      {children}
    </div>
  );
}
