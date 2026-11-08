/**
 * C075 — criação de usuários pelo admin da clínica.
 * Marcador: UAT_C075_
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
let pass = 0;
let fail = 0;

function ok(label, cond) {
  if (cond) {
    console.log(`PASS — ${label}`);
    pass++;
  } else {
    console.log(`FAIL — ${label}`);
    fail++;
  }
}

function read(rel) {
  const p = resolve(root, rel);
  if (!existsSync(p)) return "";
  return readFileSync(p, "utf8");
}

const api = read("app/api/admin/users/route.ts");
const admin = read("lib/supabase/admin.ts");
const panel = read("components/clinic-admin/ClinicUsersPanel.tsx");
const editor = read("components/platform/UserAccessEditor.tsx");
const changePwd = read("app/(shell)/auth/change-password/page.tsx");
const login = read("app/(shell)/login/ui.tsx");
const requireAuth = read("components/auth/RequireAuth.tsx");
const middleware = read("middleware.ts");
const paths = read("lib/auth/paths.ts");
const userTs = read("lib/auth/user.ts");
const compose = read("deploy/docker-compose.yml");
const client = read("lib/supabase/client.ts");

ok("API route existe", api.includes("export async function POST"));
ok("API usa createServiceRoleClient", api.includes("createServiceRoleClient"));
ok("API valida owner|admin", api.includes("callerIsOwner") && api.includes("callerIsAdmin"));
ok("API bloqueia owner sem ser owner", api.includes('role === "owner"') && api.includes("!callerIsOwner"));
ok("API createUser com must_change_password", api.includes("must_change_password: true"));
ok("API email_confirm true", api.includes("email_confirm: true"));
ok("API não concede SYSTEM_ADMIN", !api.includes("system_admins") && !api.includes("grant_system_admin"));
ok("API responde temporaryPassword", api.includes("temporaryPassword"));
ok("API não loga senha", !/console\.(log|info|debug).*temporaryPassword/.test(api));
ok("API exige house practice", api.includes('kind !== "house"') || api.includes("kind === \"house\""));

ok("admin.ts service_role helper", admin.includes("getServiceRoleKey") && admin.includes("SERVICE_ROLE_KEY"));
ok("admin.ts sem NEXT_PUBLIC service role", !admin.includes("NEXT_PUBLIC_SERVICE"));
ok("client.ts sem service_role", !client.includes("SERVICE_ROLE") && !client.includes("service_role"));

ok("ClinicUsersPanel CreateFormShell", panel.includes("CreateFormShell") && panel.includes('formId="clinic-user-create-form"'));
ok("ClinicUsersPanel PrimaryCreateButton Novo usuário", panel.includes("PrimaryCreateButton") && panel.includes("Novo usuário"));
ok("ClinicUsersPanel POST /api/admin/users", panel.includes('"/api/admin/users"'));
ok("ClinicUsersPanel revela senha uma vez", panel.includes("temporaryPassword") && panel.includes("clinic-user-temp-password"));
ok("ClinicUsersPanel WhatsApp copy", panel.includes("WhatsApp"));
ok("ClinicUsersPanel UserAccessEditor", panel.includes("UserAccessEditor") && panel.includes("allowedRoles"));
ok("ClinicUsersPanel sem copy Auth fora desta fase", !panel.includes("fora desta fase"));

ok("UserAccessEditor allowedRoles", editor.includes("allowedRoles"));

ok("change-password page", changePwd.includes("must_change_password: false") && changePwd.includes("updateUser"));
ok("login redireciona must_change_password", login.includes("CHANGE_PASSWORD_PATH") && login.includes("userMustChangePassword"));
ok("RequireAuth bloqueia mustChangePassword", requireAuth.includes("mustChangePassword") && requireAuth.includes("CHANGE_PASSWORD_PATH"));
ok("middleware redireciona /app com flag", middleware.includes("userMustChangePassword") && middleware.includes("CHANGE_PASSWORD_PATH"));
ok("paths inclui /auth/change-password", paths.includes('"/auth/change-password"'));
ok("AuthUser.mustChangePassword", userTs.includes("mustChangePassword"));

ok("compose passa SERVICE_ROLE_KEY runtime", compose.includes("SERVICE_ROLE_KEY: ${SERVICE_ROLE_KEY}"));
ok("compose não usa NEXT_PUBLIC_SERVICE_ROLE", !compose.includes("NEXT_PUBLIC_SERVICE_ROLE"));

console.log(`\nUAT_C075_ ${pass} pass / ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
