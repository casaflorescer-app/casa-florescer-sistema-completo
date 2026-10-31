import { redirect } from "next/navigation";

/** C066 — placeholder D: não expor na V1; rota redireciona. */
export default function ClinicSettingsPage() {
  redirect("/app/admin");
}
