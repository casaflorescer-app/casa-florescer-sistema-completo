import { AccessDenied } from "@/components/auth/AccessDenied";

export const dynamic = "force-dynamic";

export default function UnauthorizedPage() {
  return <AccessDenied />;
}
