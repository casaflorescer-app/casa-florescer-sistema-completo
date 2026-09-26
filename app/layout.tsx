import type { Metadata, Viewport } from "next";
import { AlertProvider } from "@/components/alerts/AlertProvider";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { PwaRegister } from "@/components/pwa/PwaRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: "Casa Florescer",
  description: "Sistema de gestão clínica Casa Florescer",
  applicationName: "Casa Florescer",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Casa Florescer",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  other: {
    "mobile-web-app-capable": "yes",
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
