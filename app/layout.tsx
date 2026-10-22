import type { Metadata, Viewport } from "next";
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
  // No ar o Next deixa este layout fora do HTML. A casca fica no template,
  // que é o componente que realmente entra na resposta de /login.
  return <>{children}</>;
}
