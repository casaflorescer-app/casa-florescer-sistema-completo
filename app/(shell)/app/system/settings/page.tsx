import { redirect } from "next/navigation";

/** C066 — placeholder D: não expor na V1; rota redireciona. */
export default function SystemSettingsPage() {
  redirect("/app/system");
}
