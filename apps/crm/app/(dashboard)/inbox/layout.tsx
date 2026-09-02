/**
 * Chat em altura fixa (viewport − header − padding do shell), com scroll só dentro
 * da lista e da área de mensagens — evita scroll da página inteira.
 */
export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-4 -my-6 flex h-[calc(100dvh-var(--header-height))] min-h-0 flex-1 flex-col overflow-hidden px-5 pb-5 pt-4 md:-my-8">
      {children}
    </div>
  );
}
