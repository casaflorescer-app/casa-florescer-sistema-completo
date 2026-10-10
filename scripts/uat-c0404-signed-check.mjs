import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readEnv(name) {
  const line = readFileSync(resolve(".env.local"), "utf8")
    .split(/\r?\n/)
    .find((item) => item.startsWith(name + "="));
  return line.slice(name.length + 1).trim().replace(/^"|"$/g, "");
}

const sb = createClient(readEnv("NEXT_PUBLIC_SUPABASE_URL"), readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
  auth: { persistSession: false },
});
const { error: loginError } = await sb.auth.signInWithPassword({
  email: "uat.b34.physician.a@exemplo.local",
  password: process.env.UAT_B34_PASSWORD,
});
if (loginError) {
  console.log("FAIL — login", loginError.message);
  process.exit(1);
}
const { error } = await sb.rpc("ai_assistance_request_create", {
  p_encounter_id: process.env.UAT_C0404_ENCOUNTER_ID,
  p_suggestion_type: "soap",
});
if (error && /ENCOUNTER_NOT_OPEN/i.test(error.message)) {
  console.log("PASS — encounter assinado bloqueia IA");
} else {
  console.log("FAIL — encounter assinado bloqueia IA:", error?.message ?? "allowed");
  process.exitCode = 1;
}
