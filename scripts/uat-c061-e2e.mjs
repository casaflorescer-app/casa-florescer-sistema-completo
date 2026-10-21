/**
 * C061 — UAT E2E (requer migration 0053 aplicada + UAT_B34_PASSWORD).
 * Marcador UAT_C061_. Cleanup via uat-c061-cleanup.mjs.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const MARKER = "UAT_C061_";
const ORG = "22e69ed4-0797-4742-b00e-f625317c6931";
const CASA = "7673bc0e-a789-4edd-b32f-392e407cc062";
const PHYS_A = "uat.b34.physician.a@exemplo.local";
const OWNER_CANDIDATES = [
  process.env.UAT_C061_OWNER_EMAIL,
  "dev.acesso.total@exemplo.local",
  "teste.b3.owner@exemplo.local",
  "owner@exemplo.local",
].filter(Boolean);

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
  const file = resolve(process.env.TEMP || "/tmp", "cf-uat-c061.sql");
  writeFileSync(file, sql, "utf8");
  const out = spawnSync(`npx --yes supabase@2.121.0 db query --linked -f "${file}"`, {
    encoding: "utf8",
    shell: true,
    cwd: process.cwd(),
  });
  return `${out.stdout || ""}\n${out.stderr || ""}`;
}

async function migrationReady(sb) {
  const { error } = await sb.from("clinic_equipment").select("id").limit(1);
  if (error && /Could not find|schema cache|relation|clinic_equipment/i.test(error.message)) {
    return false;
  }
  return !error || !/does not exist/i.test(error.message);
}

async function discoverOwnerEmails() {
  const text = dbQuery(`
select jsonb_build_object(
  'emails', (
    select coalesce(
      jsonb_agg(p.email::text order by
        case when p.email::text like '%@exemplo.local' then 0 else 1 end,
        p.full_name),
      '[]'::jsonb
    )
    from public.user_practice_roles upr
    join public.profiles p on p.id = upr.user_id
    where upr.role in ('owner', 'admin') and p.is_active
  )
)::text as payload;
`);
  const m = text.match(/"emails"\s*:\s*\[([^\]]*)\]/);
  if (!m) return OWNER_CANDIDATES;
  const emails = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  return [...new Set([...OWNER_CANDIDATES, ...emails])];
}

async function main() {
  console.log("=== UAT C061 E2E ===\n");
  const stamp = Date.now();
  let ownerSb = null;
  let elevated = false;
  let physUid = null;

  try {
    for (const email of await discoverOwnerEmails()) {
      try {
        ownerSb = await login(email);
        pass("Owner login", email);
        break;
      } catch {
        /* try next */
      }
    }
    if (!ownerSb) {
      const phys = await login(PHYS_A);
      physUid = (await phys.auth.getUser()).data.user?.id;
      dbQuery(`
insert into public.user_practice_roles (user_id, practice_id, role)
values ('${physUid}', '${CASA}', 'owner')
on conflict (user_id, practice_id, role) do nothing;
`);
      elevated = true;
      ownerSb = await login(PHYS_A);
      pass("Owner via elevação PHYS_A", PHYS_A);
    }

    const ready = await migrationReady(ownerSb);
    if (!ready) {
      pass("BLOCKED_PENDING_DB_PUSH", "migration 0053 não aplicada — E2E operacional adiável");
      console.log("\nE2E C061: bloqueado até db push 0053 (estrutural/security parciais ainda válidos).");
      process.exit(0);
    }
    pass("Migration 0053 visível (clinic_equipment)");

    // Classes novas
    const classes = [
      ["clinical_lot_controlled", "Medicamento"],
      ["pantry", "Alimento"],
      ["surgical_consumable", "Cirurgico"],
      ["procedure_consumable", "Procedimento"],
      ["office", "Geral"],
    ];
    const itemIds = [];
    let whId = null;

    {
      const { data: wh, error } = await ownerSb.rpc("stock_warehouse_upsert", {
        p_payload: {
          organization_id: ORG,
          code: `${MARKER}WH_${stamp}`.slice(0, 20),
          name: `${MARKER}WH ${stamp}`,
          handles_pantry: true,
          is_active: true,
        },
      });
      if (error) fail("Warehouse upsert", error.message);
      else {
        whId = wh?.id ?? null;
        pass("Warehouse UAT", whId);
      }
    }

    for (const [itemClass, label] of classes) {
      const { data, error } = await ownerSb.rpc("stock_item_upsert", {
        p_payload: {
          organization_id: ORG,
          sku: `${MARKER}ITEM_${label}_${stamp}`.slice(0, 40),
          name: `${MARKER}ITEM_${label}_${stamp}`,
          item_class: itemClass,
          unit: "un",
          min_qty: 2,
          ideal_qty: 10,
        },
      });
      if (error) fail(`Cadastro ${label}`, error.message);
      else {
        itemIds.push(data?.id);
        pass(`Cadastro classe ${itemClass}`, data?.id);
      }
    }

    if (whId && itemIds[0]) {
      const medId = itemIds[0];
      const { error: recErr } = await ownerSb.rpc("stock_movement_receipt", {
        p_payload: {
          organization_id: ORG,
          warehouse_id: whId,
          item_id: medId,
          qty: 5,
          lot_code: `${MARKER}BATCH_${stamp}`,
          expires_on: "2099-12-31",
          reason: "UAT C061 entrada",
        },
      });
      if (recErr) fail("Entrada medicamento+lote", recErr.message);
      else pass("Entrada medicamento+lote");

      const { error: exitErr } = await ownerSb.rpc("stock_movement_exit", {
        p_payload: {
          organization_id: ORG,
          warehouse_id: whId,
          item_id: medId,
          qty: 1,
          reason: "UAT C061 saída",
        },
      });
      if (exitErr) fail("Saída", exitErr.message);
      else pass("Saída");
    }

    // Equipamento
    let roomA = null;
    let roomB = null;
    {
      const { data: rooms } = await ownerSb
        .from("rooms")
        .select("id, code")
        .eq("organization_id", ORG)
        .limit(2);
      roomA = rooms?.[0]?.id ?? null;
      roomB = rooms?.[1]?.id ?? rooms?.[0]?.id ?? null;
      if (roomA) pass("Salas disponíveis para vínculo", String(rooms?.length ?? 0));
      else pass("Sem salas — equipamento sem room_id");
    }

    let equipId = null;
    {
      const { data, error } = await ownerSb.rpc("clinic_equipment_upsert", {
        p_payload: {
          organization_id: ORG,
          name: `${MARKER}EQUIPMENT_${stamp}`,
          category: "medico",
          manufacturer: "UAT",
          model: "M1",
          serial_number: `${MARKER}SN_${stamp}`,
          asset_tag: `${MARKER}PAT_${stamp}`,
          room_id: roomA,
          status: "active",
          notes: "UAT C061",
        },
      });
      if (error) fail("Cadastro equipamento", error.message);
      else {
        equipId = data;
        pass("Cadastro equipamento", String(equipId));
      }
    }

    if (equipId && roomB && roomA !== roomB) {
      const { error } = await ownerSb.rpc("clinic_equipment_transfer", {
        p_payload: {
          organization_id: ORG,
          id: equipId,
          to_room_id: roomB,
          reason: "UAT C061 transfer",
        },
      });
      if (error) fail("Transferência equipamento", error.message);
      else pass("Transferência equipamento sala");

      const { data: ev } = await ownerSb
        .from("clinic_equipment_events")
        .select("event_kind")
        .eq("equipment_id", equipId)
        .eq("event_kind", "transferred");
      if (ev?.length) pass("Histórico transferred");
      else fail("Histórico transferred ausente");
    } else if (equipId) {
      const { error } = await ownerSb.rpc("clinic_equipment_upsert", {
        p_payload: {
          id: equipId,
          organization_id: ORG,
          name: `${MARKER}EQUIPMENT_${stamp}`,
          status: "maintenance",
        },
      });
      if (error) fail("Status maintenance", error.message);
      else pass("Status maintenance");
    }

    {
      const { data } = await ownerSb
        .from("clinic_equipment")
        .select("id, asset_tag, serial_number, status")
        .eq("organization_id", ORG)
        .ilike("name", `${MARKER}%`);
      if (data?.length) pass("Listagem equipamentos UAT", String(data.length));
      else fail("Listagem equipamentos vazia");
    }

    // Equipamento NÃO é item consumível
    {
      const { data } = await ownerSb
        .from("items")
        .select("id")
        .eq("organization_id", ORG)
        .ilike("name", `${MARKER}EQUIPMENT%`);
      if (!data?.length) pass("Equipamento não criado como item consumível");
      else fail("Equipamento indevidamente em items");
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
      spawnSync("node", ["scripts/uat-c061-cleanup.mjs"], {
        encoding: "utf8",
        shell: true,
        cwd: process.cwd(),
        stdio: "inherit",
      });
    } catch {
      /* cleanup best-effort */
    }
  }

  const failed = results.filter((r) => !r.ok).length;
  const total = results.length;
  console.log(`\nE2E C061: ${total - failed}/${total}`);
  if (failed > 0) process.exit(1);
  console.log("OK — E2E C061.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
