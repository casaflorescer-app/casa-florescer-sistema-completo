import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { AlertProvider } from "@/components/alerts/AlertProvider";
import "./globals.css";

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Casa Florescer",
  description: "Sistema da clínica — agenda, prontuário, recepção e gestão.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className={`${sans.variable} font-sans antialiased`}>
        <AlertProvider>{children}</AlertProvider>
      </body>
    </html>
  );
}
