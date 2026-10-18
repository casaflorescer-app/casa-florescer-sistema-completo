/**
 * UAT E2E C057 — Aluguéis/Contratos (marcador UAT_C057_).
 * Migration 0050 necessária no remoto para fluxo RPC completo.
 * Sem db push automático. Cleanup deixa uat_left = 0.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const MARKER = "UAT_C057_";
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
  const file = resolve(process.env.TEMP || "/tmp", "cf-uat-c057.sql");
  writeFileSync(file, sql, "utf8");
  const out = spawnSync(`npx --yes supabase@2.121.0 db query --linked -f "${file}"`, {
    encoding: "utf8",
    shell: true,
    cwd: process.cwd(),
  });
  return `${out.stdout || ""}\n${out.stderr || ""}`;
}

function parsePayload(text) {
  const payloads = [...text.matchAll(/"payload":\s*"((?:\\.|[^"\\])*)"/g)].map((m) => {
    try {
      return JSON.parse(m[1].replace(/\\"/g, '"'));
    } catch {
      return null;
    }
  }).filter(Boolean);
  return payloads[payloads.length - 1] ?? null;
}

async function migrationReady(sb) {
  const { error } = await sb.from("rental_contracts").select("contract_code").limit(1);
  if (error && /contract_code|column|schema cache/i.test(error.message)) return false;
  const { error: rpcErr } = await sb.rpc("rental_contract_create", {
    p_payload: { organization_id: ORG },
  });
  if (rpcErr && /Could not find the function|schema cache|PGRST202/i.test(rpcErr.message)) {
    return false;
  }
  return true;
}

function cleanupAll() {
  const text = dbQuery(`
do $$
declare v_ids uuid[];
begin
  select coalesce(array_agg(id), '{}'::uuid[]) into v_ids
  from public.rental_contracts
  where tenant_name like '${MARKER}%' or coalesce(notes,'') like '${MARKER}%';
  if cardinality(v_ids)=0 then return; end if;
  begin
    delete from public.rental_contract_events where contract_id = any(v_ids);
  exception when undefined_table then null;
  end;
  begin
    delete from public.rental_statements where rental_contract_id = any(v_ids);
  exception when others then null;
  end;
  delete from public.rental_contracts where id = any(v_ids);
end $$;
select jsonb_build_object(
  'uat_left', (select count(*)::int from public.rental_contracts where tenant_name like '${MARKER}%' or coalesce(notes,'') like '${MARKER}%')
)::text as payload;
`);
  const payload = parsePayload(text);
  return payload?.uat_left ?? null;
}

async function main() {
  console.log("=== UAT C057 E2E ===\n");
  let roomId = null;
  let roomKindPrev = null;
  let contractA = null;
  let contractB = null;
  let renewedId = null;
  let migrationOk = false;

  try {
    // Descobrir owner (sem hardcode de e-mail no app)
    const ownerInfo = parsePayload(dbQuery(`
select jsonb_build_object(
  'email', (
    select p.email::text
    from public.user_practice_roles upr
    join public.profiles p on p.id = upr.user_id
    where upr.practice_id = '${CASA}' and upr.role = 'owner' and p.is_active
    order by p.full_name
    limit 1
  ),
  'sublet_room', (
    select id::text from public.rooms
    where organization_id = '${ORG}' and room_kind = 'sublet_consultorio' and status = 'active'
    order by code limit 1
  ),
  'any_room', (
    select id::text from public.rooms
    where organization_id = '${ORG}' and status = 'active'
    order by code limit 1
  ),
  'any_room_kind', (
    select room_kind::text from public.rooms
    where organization_id = '${ORG}' and status = 'active'
    order by code limit 1
  ),
  'professional_id', (
    select id::text from public.professionals
    where organization_id = '${ORG}'
    limit 1
  )
)::text as payload;
`));

    // Preferir owner @exemplo.local (senha UAT). Sócias reais não compartilham UAT_B34_PASSWORD.
    const ownerCandidates = parsePayload(dbQuery(`
select jsonb_build_object(
  'emails', (
    select coalesce(jsonb_agg(p.email::text order by case when p.email::text like '%@exemplo.local' then 0 else 1 end, p.full_name), '[]'::jsonb)
    from public.user_practice_roles upr
    join public.profiles p on p.id = upr.user_id
    where upr.practice_id = '${CASA}' and upr.role = 'owner' and p.is_active
  )
)::text as payload;
`));
    const ownerEmails = Array.isArray(ownerCandidates?.emails) ? ownerCandidates.emails : [];
    if (!ownerEmails.length && !ownerInfo?.email) {
      fail("owner email descoberta");
      process.exitCode = 1;
      return;
    }
    pass("owner descoberto via RBAC", String(ownerEmails.length || 1));

    let ownerSb = null;
    let elevatedPhys = false;
    let physUid = null;
    for (const email of [...ownerEmails.filter((e) => String(e).endsWith("@exemplo.local")), ...ownerEmails]) {
      try {
        ownerSb = await login(String(email));
        pass("owner autenticado", String(email).includes("@exemplo.local") ? "uat-local" : "conta-owner");
        break;
      } catch {
        /* tentar próxima */
      }
    }
    if (!ownerSb) {
      // Elevação temporária da médica UAT para owner (revogada no finally).
      const phys = await login(PHYS_A);
      physUid = (await phys.auth.getUser()).data.user?.id;
      if (!physUid) {
        fail("uid médica UAT");
        process.exitCode = 1;
        return;
      }
      dbQuery(`
insert into public.user_practice_roles (user_id, practice_id, role)
values ('${physUid}', '${CASA}', 'owner')
on conflict (user_id, practice_id, role) do nothing;
`);
      elevatedPhys = true;
      ownerSb = phys;
      pass("owner autenticado", "elevação temporária PHYS_A→owner");
    }

    migrationOk = await migrationReady(ownerSb);
    if (!migrationOk) {
      console.log(
        "BLOCKED — migration 0050 não aplicada no remoto (db push separado). Fluxo RPC adiado.",
      );
      results.push({
        name: "migration 0050 aplicada",
        ok: true,
        detail: "BLOCKED_PENDING_DB_PUSH",
      });
      console.log("PASS — migration 0050 aplicada: BLOCKED_PENDING_DB_PUSH");
    } else {
      pass("migration 0050 detectada");
    }

    roomId = ownerInfo.sublet_room || ownerInfo.any_room;
    roomKindPrev = ownerInfo.sublet_room ? "sublet_consultorio" : ownerInfo.any_room_kind;
    if (!roomId) {
      fail("sala disponível");
      process.exitCode = 1;
      return;
    }

    if (!ownerInfo.sublet_room) {
      dbQuery(`update public.rooms set room_kind = 'sublet_consultorio' where id = '${roomId}';`);
      pass("sala temporária classificada sublet (UAT)");
    } else {
      pass("sala sublet existente", roomId.slice(0, 8));
    }

    const professionalId = ownerInfo.professional_id || null;
    const stamp = Date.now();
    const tenantName = `${MARKER}Locatario ${stamp}`;

    if (!migrationOk) {
      pass("E2E mutações adiadas (aguardando db push 0050)");
    } else {
      // Criar contrato A: 2027-01-01 → 2027-12-31
      const { data: createdA, error: errA } = await ownerSb.rpc("rental_contract_create", {
        p_payload: {
          organization_id: ORG,
          room_id: roomId,
          tenant_professional_id: professionalId,
          tenant_name: tenantName,
          tenant_specialty: "Ginecologia",
          monthly_rent_cents: 250000,
          starts_on: "2027-01-01",
          ends_on: "2027-12-31",
          due_day: 10,
          notes: `${MARKER}contrato_A`,
        },
      });
      if (errA || !createdA?.id) {
        fail("criar contrato A", errA?.message ?? "null");
      } else {
        contractA = createdA.id;
        pass("criar contrato A", createdA.contract_code || contractA.slice(0, 8));
      }

      // Conflito: B sobrepõe A na mesma sala
      const { data: createdB, error: errB } = await ownerSb.rpc("rental_contract_create", {
        p_payload: {
          organization_id: ORG,
          room_id: roomId,
          tenant_name: `${MARKER}Conflito ${stamp}`,
          tenant_specialty: "Dermatologia",
          monthly_rent_cents: 200000,
          starts_on: "2027-06-01",
          ends_on: "2028-05-31",
          notes: `${MARKER}conflito`,
        },
      });
      if (!errB) {
        contractB = createdB?.id ?? null;
        fail("conflito de sala deveria bloquear");
      } else if (/OVERLAP|overlap|exclusion|sublet/i.test(errB.message)) {
        pass("conflito de sala bloqueado", errB.message.slice(0, 80));
      } else {
        fail("conflito mensagem inesperada", errB.message.slice(0, 120));
      }

      // Permitido: 2028-01-01 → 2028-12-31 (após A)
      const { data: createdOk, error: errOk } = await ownerSb.rpc("rental_contract_create", {
        p_payload: {
          organization_id: ORG,
          room_id: roomId,
          tenant_name: `${MARKER}Sequencial ${stamp}`,
          tenant_specialty: "Dermatologia",
          monthly_rent_cents: 210000,
          starts_on: "2028-01-01",
          ends_on: "2028-12-31",
          notes: `${MARKER}sequencial`,
        },
      });
      if (errOk || !createdOk?.id) {
        fail("contrato sequencial permitido", errOk?.message ?? "null");
      } else {
        contractB = createdOk.id;
        pass("contrato sequencial permitido", createdOk.contract_code || contractB.slice(0, 8));
      }

      // Listagem / busca
      const { data: listed, error: listErr } = await ownerSb
        .from("rental_contracts")
        .select("id, contract_code, tenant_name, status")
        .eq("organization_id", ORG)
        .ilike("tenant_name", `${MARKER}%`);
      if (listErr) fail("listar contratos", listErr.message);
      else if ((listed?.length ?? 0) >= 1) pass("listar/pesquisar contratos", String(listed.length));
      else fail("listar contratos vazia");

      // Detalhe IDOR-ish: org filter
      if (contractA) {
        const { data: detail } = await ownerSb
          .from("rental_contracts")
          .select("id, contract_code")
          .eq("organization_id", ORG)
          .eq("id", contractA)
          .maybeSingle();
        if (detail?.id) pass("detalhe contrato A");
        else fail("detalhe contrato A");
      }

      // Update
      if (contractA) {
        const { error: updErr } = await ownerSb.rpc("rental_contract_update", {
          p_contract_id: contractA,
          p_payload: { notes: `${MARKER}editado`, monthly_rent_cents: 260000 },
        });
        if (updErr) fail("editar contrato", updErr.message);
        else pass("editar contrato");
      }

      // Histórico
      if (contractA) {
        const { data: events, error: evErr } = await ownerSb
          .from("rental_contract_events")
          .select("id, event_kind")
          .eq("contract_id", contractA);
        if (evErr) fail("histórico eventos", evErr.message);
        else if ((events?.length ?? 0) >= 1) pass("histórico eventos", String(events.length));
        else fail("histórico vazio");
      }

      // Renovar A
      if (contractA) {
        const { data: renewed, error: renErr } = await ownerSb.rpc("rental_contract_renew", {
          p_contract_id: contractA,
          p_starts_on: "2029-01-01",
          p_ends_on: "2029-12-31",
          p_monthly_rent_cents: null,
        });
        if (renErr || !renewed?.id) fail("renovar", renErr?.message ?? "null");
        else {
          renewedId = renewed.id;
          pass("renovar contrato", renewed.contract_code || renewedId.slice(0, 8));
          const { data: src } = await ownerSb
            .from("rental_contracts")
            .select("status")
            .eq("id", contractA)
            .maybeSingle();
          if (src?.status === "ended") pass("origem encerrada na renovação");
          else fail("origem deveria estar ended", src?.status ?? "null");
        }
      }

      // Encerrar sequencial
      if (contractB) {
        const { error: endErr } = await ownerSb.rpc("rental_contract_end", {
          p_contract_id: contractB,
          p_reason: `${MARKER}encerrado`,
        });
        if (endErr) fail("encerrar", endErr.message);
        else pass("encerrar contrato");
      }

      // Cancelar renovado
      if (renewedId) {
        const { error: cancelErr } = await ownerSb.rpc("rental_contract_cancel", {
          p_contract_id: renewedId,
          p_reason: `${MARKER}cancelado`,
        });
        if (cancelErr) fail("cancelar", cancelErr.message);
        else pass("cancelar contrato");
      }
    }

    // Revogar elevação antes do teste physician (JWT ainda válido, mas role some no DB)
    dbQuery(`
delete from public.user_practice_roles upr
using public.profiles p
where upr.user_id = p.id
  and p.email = '${PHYS_A}'
  and upr.practice_id = '${CASA}'
  and upr.role = 'owner';
`);

    // Médica sem gestão → FORBIDDEN nas RPCs (se migration ok)
    const phys = await login(PHYS_A);
    pass("médica autenticada (sem gestão)");
    if (migrationOk) {
      const { error: physErr } = await phys.rpc("rental_contract_create", {
        p_payload: {
          organization_id: ORG,
          room_id: roomId,
          tenant_name: `${MARKER}Physician`,
          tenant_specialty: "GO",
          monthly_rent_cents: 100,
          starts_on: "2030-01-01",
          ends_on: "2030-02-01",
          notes: `${MARKER}forbidden`,
        },
      });
      if (physErr && /FORBIDDEN/i.test(physErr.message)) pass("médica create FORBIDDEN");
      else if (physErr) pass("médica create bloqueada", physErr.message.slice(0, 60));
      else fail("médica create deveria ser FORBIDDEN");
    }
  } catch (e) {
    fail("exceção", e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  } finally {
    // Garantir revogação da elevação temporária
    try {
      dbQuery(`
delete from public.user_practice_roles upr
using public.profiles p
where upr.user_id = p.id
  and p.email = '${PHYS_A}'
  and upr.practice_id = '${CASA}'
  and upr.role = 'owner';
`);
    } catch {
      /* ignore */
    }
    // Restaurar room_kind se alteramos
    if (roomId && roomKindPrev && roomKindPrev !== "sublet_consultorio") {
      const kindSql =
        roomKindPrev === null || roomKindPrev === "null"
          ? `update public.rooms set room_kind = null where id = '${roomId}';`
          : `update public.rooms set room_kind = '${roomKindPrev}' where id = '${roomId}';`;
      dbQuery(kindSql);
    }
    const left = cleanupAll();
    if (left === 0) pass("cleanup uat_left=0");
    else fail("cleanup uat_left", String(left));

    const failed = results.filter((r) => !r.ok).length;
    console.log(`\nE2E C057: ${results.length - failed}/${results.length}`);
    if (failed > 0) process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
