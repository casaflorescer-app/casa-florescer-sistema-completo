import { ClientPatientGate } from "@/components/layout/StaticAuthGates";

export default function PacienteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ClientPatientGate>{children}</ClientPatientGate>;
}
