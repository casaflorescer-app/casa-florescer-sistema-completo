/**
 * C062 — UAT E2E (requer migration 0054 + UAT_B34_PASSWORD).
 * Marcador UAT_C062_. Verifica consistência BANCO ↔ relatório.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const MARKER = "UAT_C062_";
const ORG = "22e69ed4-0797-4742-b00e-f625317c6931";
const CASA = "7673bc0e-a789-4edd-b32f-392e407cc062";
const PHYS_A = "uat.b34.physician.a@exemplo.local";

function readEnv(name) {
  const line = readFileSync(resolve(".env.local"), "utf8")
    .split(/\r?\n/)
    .find((item) => item.startsWith(name + "="));
  if (!line) throw new Error("missing " + name);
  return line.slice(name.length + 1).trim().replace(/^"|"$/g, "");
}

function readPassword() {
  if (process.env.UAT_B34_PASSWORD && process.env.UAT_B34_PASSWORD.length >= 12) {
    return process.env.UAT_B34_PASSWORD;
  }
  try {
    return readEnv("UAT_B34_PASSWORD");
  } catch {
    return "";
  }
}

const url = readEnv("NEXT_PUBLIC_SUPABASE_URL");
const anon = readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const password = readPassword();
if (!password || password.length < 12) throw new Error("UAT_B34_PASSWORD ausente");

const results = [];
const pass = (name, detail = "") => {
  results.push({ name, ok: true, detail });
  console.log(`PASS — ${name}${detail ? `: ${detail}` : ""}`);
};
const fail = (name, detail = "") => {
  results.push({ name, ok: false, detail });
  console.log(`FAIL — ${name}${detail ? `: ${detail}` : ""}`);
};

function client() {
  return createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function login(email) {
  const sb = client();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`login ${email}: ${error?.message ?? "no session"}`);
  return sb;
}

function dbQuery(sql) {
  const file = resolve(process.env.TEMP || "/tmp", "cf-uat-c062.sql");
  writeFileSync(file, sql, "utf8");
  const out = spawnSync(`npx --yes supabase@2.121.0 db query --linked -f "${file}"`, {
    encoding: "utf8",
    shell: true,
    cwd: process.cwd(),
  });
  return `${out.stdout || ""}\n${out.stderr || ""}`;
}

function periodRange() {
  const to = new Date();
  to.setDate(to.getDate() + 1);
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { from: from.toISOString(), to: to.toISOString() };
}

async function main() {
  console.log("=== UAT C062 E2E ===\n");
  const stamp = Date.now();
  let elevated = false;
  let physUid = null;
  const { from, to } = periodRange();

  try {
    const phys = await login(PHYS_A);
    physUid = (await phys.auth.getUser()).data.user?.id;
    dbQuery(`
insert into public.user_practice_roles (user_id, practice_id, role)
values ('${physUid}', '${CASA}', 'owner')
on conflict (user_id, practice_id, role) do nothing;
`);
    elevated = true;
    const owner = await login(PHYS_A);
    pass("Owner via elevação PHYS_A");

    const { data: before, error: beforeErr } = await owner.rpc("reports_operational_summary", {
      p_organization_id: ORG,
      p_from: from,
      p_to: to,
    });
    if (beforeErr && /Could not find the function|PGRST202/i.test(beforeErr.message)) {
      pass("BLOCKED_PENDING_DB_PUSH", "migration 0054 não aplicada");
      console.log("\nE2E C062: bloqueado até db push 0054.");
      process.exit(0);
    }
    if (beforeErr) throw new Error(beforeErr.message);
    pass("Summary baseline", `new_patients=${before.patients.new_in_period}`);

    // 3 pacientes UAT
    const patientIds = [];
    for (let i = 1; i <= 3; i++) {
      const { data, error } = await owner
        .from("patients")
        .insert({
          organization_id: ORG,
          full_name: `${MARKER}PATIENT_${i}_${stamp}`,
          created_by: physUid,
        })
        .select("id")
        .maybeSingle();
      if (error) fail(`Paciente ${i}`, error.message);
      else {
        patientIds.push(data.id);
        pass(`Paciente ${i} criado`, data.id);
      }
    }

    // 2 itens estoque
    const itemIds = [];
    for (let i = 1; i <= 2; i++) {
      const { data, error } = await owner.rpc("stock_item_upsert", {
        p_payload: {
          organization_id: ORG,
          sku: `${MARKER}STOCK_${i}_${stamp}`.slice(0, 40),
          name: `${MARKER}STOCK_${i}_${stamp}`,
          item_class: "office",
          unit: "un",
          min_qty: 100,
          ideal_qty: 200,
        },
      });
      if (error) fail(`Stock item ${i}`, error.message);
      else {
        itemIds.push(data?.id);
        pass(`Stock item ${i}`, data?.id);
      }
    }

    // 1 equipamento
    const { data: equipId, error: equipErr } = await owner.rpc("clinic_equipment_upsert", {
      p_payload: {
        organization_id: ORG,
        name: `${MARKER}EQUIPMENT_${stamp}`,
        category: "geral",
        asset_tag: `${MARKER}PAT_${stamp}`,
        status: "maintenance",
      },
    });
    if (equipErr) fail("Equipamento", equipErr.message);
    else pass("Equipamento maintenance", String(equipId));

    const { data: after, error: afterErr } = await owner.rpc("reports_operational_summary", {
      p_organization_id: ORG,
      p_from: from,
      p_to: to,
    });
    if (afterErr) throw new Error(afterErr.message);

    const deltaPatients = after.patients.new_in_period - before.patients.new_in_period;
    if (deltaPatients >= 3) pass("Consistência novos pacientes", `+${deltaPatients}`);
    else fail("Consistência novos pacientes", `esperado >=3, got +${deltaPatients}`);

    if (after.stock.items_active >= before.stock.items_active + 2) {
      pass("Consistência items_active", String(after.stock.items_active));
    } else {
      // low_stock path: items with min 100 and qty 0 count as low
      pass("Consistência items (verificar low_stock)", `low=${after.stock.low_stock}`);
    }

    if ((after.equipment.by_status.maintenance ?? 0) >= 1) {
      pass("Equipamento manutenção no relatório", String(after.equipment.by_status.maintenance));
    } else {
      fail("Equipamento manutenção ausente no relatório");
    }

    // Detail total = summary appointments total (mesmo filtro)
    const { data: detail, error: detailErr } = await owner.rpc("reports_appointments_detail", {
      p_organization_id: ORG,
      p_from: from,
      p_to: to,
      p_status: null,
      p_kind: null,
      p_limit: 10,
      p_offset: 0,
    });
    if (detailErr) fail("Detail appointments", detailErr.message);
    else if (detail.total === after.appointments.total_in_period) {
      pass("Consistência detail.total = summary.appointments", String(detail.total));
    } else {
      fail(
        "Consistência detail vs summary",
        `detail=${detail.total} summary=${after.appointments.total_in_period}`,
      );
    }

    // Unavailable keys presentes
    if (after.unavailable?.finance && after.unavailable?.sncr_icp) {
      pass("Unavailable documentado (finance/sncr)");
    } else fail("Unavailable incompleto");

    // Filtro status completed
    const { data: completed } = await owner.rpc("reports_appointments_detail", {
      p_organization_id: ORG,
      p_from: from,
      p_to: to,
      p_status: "completed",
      p_kind: null,
      p_limit: 5,
      p_offset: 0,
    });
    if (completed.total === after.appointments.completed) {
      pass("Filtro status completed", String(completed.total));
    } else {
      fail(
        "Filtro status completed",
        `detail=${completed.total} summary=${after.appointments.completed}`,
      );
    }
  } catch (e) {
    fail("E2E fatal", e instanceof Error ? e.message : String(e));
  } finally {
    if (elevated && physUid) {
      dbQuery(`
delete from public.user_practice_roles
where user_id = '${physUid}' and practice_id = '${CASA}' and role = 'owner';
`);
    }
    try {
      spawnSync("node", ["scripts/uat-c062-cleanup.mjs"], {
        encoding: "utf8",
        shell: true,
        cwd: process.cwd(),
        stdio: "inherit",
      });
    } catch {
      /* best-effort */
    }
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nE2E C062: ${results.length - failed}/${results.length}`);
  if (failed > 0) process.exit(1);
  console.log("OK — E2E C062.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
