import { Nunito } from "next/font/google";
import { AlertProvider } from "@/components/alerts/AlertProvider";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { PwaRegister } from "@/components/pwa/PwaRegister";
import "../globals.css";

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export default function ShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={nunito.variable}>
      <body className="font-sans antialiased" data-casa="layout-9">
        <AuthProvider>
          <AlertProvider>
            {children}
            <PwaRegister />
          </AlertProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
