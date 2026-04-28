import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CRM Valepan",
  description: "CRM comercial integrado ao WhatsApp",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
