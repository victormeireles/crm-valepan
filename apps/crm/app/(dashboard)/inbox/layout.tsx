/**
 * Chat ocupa 100% da área abaixo do header. `absolute inset-0` preenche o main
 * do shell (já com altura definida) para não gerar scroll da página.
 */
export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-inbox-shell
      className="absolute inset-0 flex min-h-0 flex-col overflow-hidden overscroll-none px-4 py-3 md:px-5 md:py-4"
    >
      {children}
    </div>
  );
}
