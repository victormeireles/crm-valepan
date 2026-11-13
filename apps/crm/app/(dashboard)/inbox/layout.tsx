/**
 * Chat full-bleed abaixo do header (estilo WhatsApp Web): sem padding externo.
 * `absolute inset-0` preenche o main do shell para não gerar scroll da página.
 */
export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-inbox-shell
      className="absolute inset-0 flex min-h-0 flex-col overflow-hidden overscroll-none"
    >
      {children}
    </div>
  );
}
