import { AlertProvider } from "@/components/alerts/AlertProvider";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { PwaRegister } from "@/components/pwa/PwaRegister";

export default function AppTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="font-sans antialiased" data-casa="layout-8">
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
