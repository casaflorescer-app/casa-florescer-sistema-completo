import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { AlertProvider } from "@/components/alerts/AlertProvider";
import { PwaRegister } from "@/components/pwa/PwaRegister";
import "./globals.css";

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Casa Florescer",
  description: "Agenda, recepção e acompanhamento da Casa Florescer.",
  applicationName: "Casa Florescer",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Casa Florescer",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/icons/favicon-32.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#923A66",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
        <PwaRegister />
      </body>
    </html>
  );
}
