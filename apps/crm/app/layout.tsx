import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-manrope-next",
  display: "swap",
});

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
    <html lang="pt-BR" className={manrope.variable}>
      <body className={`min-h-screen antialiased ${manrope.className}`}>
        {children}
      </body>
    </html>
  );
}
