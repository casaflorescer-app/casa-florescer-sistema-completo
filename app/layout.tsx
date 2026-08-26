import type { Metadata, Viewport } from "next";
import { AlertProvider } from "@/components/alerts/AlertProvider";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { PwaRegister } from "@/components/pwa/PwaRegister";
import "./globals.css";

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
      <body className="font-sans antialiased">
        <AuthProvider>
          <AlertProvider>{children}</AlertProvider>
        </AuthProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
