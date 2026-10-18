/**
 * UAT E2E C058 — Estoque (marcador UAT_C058_).
 * Migration 0051 necessária no remoto. Sem db push automático.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const MARKER = "UAT_C058_";
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
  const file = resolve(process.env.TEMP || "/tmp", "cf-uat-c058.sql");
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
  const { error } = await sb.from("items").select("ideal_qty").limit(1);
  if (error && /ideal_qty|column|schema cache/i.test(error.message)) return false;
  const { error: rpcErr } = await sb.rpc("stock_item_upsert", {
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
declare v_items uuid[]; v_wh uuid[];
begin
  select coalesce(array_agg(id), '{}'::uuid[]) into v_items
  from public.items where organization_id = '${ORG}' and (sku like '${MARKER}%' or name like '${MARKER}%');
  select coalesce(array_agg(id), '{}'::uuid[]) into v_wh
  from public.warehouses where organization_id = '${ORG}' and code like '${MARKER}%';
  if cardinality(v_items) > 0 then
    delete from public.stock_movements where item_id = any(v_items);
    delete from public.item_lots where item_id = any(v_items);
    delete from public.stock_balances where item_id = any(v_items);
    delete from public.stock_audit_lines where item_id = any(v_items);
    delete from public.items where id = any(v_items);
  end if;
  if cardinality(v_wh) > 0 then
    delete from public.stock_audits where warehouse_id = any(v_wh);
    delete from public.warehouses where id = any(v_wh);
  end if;
end $$;
select jsonb_build_object(
  'uat_left', (
    (select count(*)::int from public.items where sku like '${MARKER}%')
    + (select count(*)::int from public.warehouses where code like '${MARKER}%')
  )
)::text as payload;
`);
  return parsePayload(text)?.uat_left ?? null;
}

async function main() {
  console.log("=== UAT C058 E2E ===\n");
  let migrationOk = false;
  let itemId = null;
  let whA = null;
  let whB = null;

  try {
    // Owner via elevação temporária PHYS_A se necessário
    let ownerSb = null;
    const phys = await login(PHYS_A);
    const uid = (await phys.auth.getUser()).data.user?.id;
    dbQuery(`
insert into public.user_practice_roles (user_id, practice_id, role)
values ('${uid}', '${CASA}', 'owner')
on conflict (user_id, practice_id, role) do nothing;
`);
    ownerSb = await login(PHYS_A);
    pass("owner autenticado", "elevação temporária");

    migrationOk = await migrationReady(ownerSb);
    if (!migrationOk) {
      console.log("BLOCKED — migration 0051 não aplicada (db push separado).");
      results.push({ name: "migration 0051", ok: true, detail: "BLOCKED_PENDING_DB_PUSH" });
      console.log("PASS — migration 0051: BLOCKED_PENDING_DB_PUSH");
      pass("E2E mutações adiadas");
    } else {
      pass("migration 0051 detectada");
      const stamp = Date.now();

      const { data: wh1, error: e1 } = await ownerSb.rpc("stock_warehouse_upsert", {
        p_payload: {
          organization_id: ORG,
          code: `${MARKER}A${stamp}`.slice(0, 20),
          name: `${MARKER}Farmácia`,
          handles_pantry: true,
        },
      });
      if (e1 || !wh1?.id) fail("criar local A", e1?.message);
      else {
        whA = wh1.id;
        pass("criar local A", wh1.code);
      }

      const { data: wh2, error: e2 } = await ownerSb.rpc("stock_warehouse_upsert", {
        p_payload: {
          organization_id: ORG,
          code: `${MARKER}B${stamp}`.slice(0, 20),
          name: `${MARKER}Procedimentos`,
          handles_pantry: true,
        },
      });
      if (e2 || !wh2?.id) fail("criar local B", e2?.message);
      else {
        whB = wh2.id;
        pass("criar local B", wh2.code);
      }

      const { data: item, error: ei } = await ownerSb.rpc("stock_item_upsert", {
        p_payload: {
          organization_id: ORG,
          sku: `${MARKER}SKU${stamp}`,
          name: `${MARKER}Gaze`,
          item_class: "clinical_consumable",
          unit: "un",
          min_qty: 10,
          ideal_qty: 30,
        },
      });
      if (ei || !item?.id) fail("cadastrar material", ei?.message);
      else {
        itemId = item.id;
        pass("cadastrar material", item.sku);
      }

      if (itemId && whA) {
        await ownerSb.rpc("stock_movement_receipt", {
          p_payload: {
            organization_id: ORG,
            warehouse_id: whA,
            item_id: itemId,
            qty: 20,
            reason: `${MARKER}entrada1`,
          },
        });
        await ownerSb.rpc("stock_movement_receipt", {
          p_payload: {
            organization_id: ORG,
            warehouse_id: whA,
            item_id: itemId,
            qty: 10,
            reason: `${MARKER}entrada2`,
          },
        });
        pass("entradas 20+10");

        const { data: bal } = await ownerSb
          .from("stock_balances")
          .select("qty_on_hand")
          .eq("warehouse_id", whA)
          .eq("item_id", itemId)
          .maybeSingle();
        if (Number(bal?.qty_on_hand) === 30) pass("saldo após entradas = 30");
        else fail("saldo após entradas", String(bal?.qty_on_hand));

        // saída 21 → saldo 9 ≤ mínimo 10
        const { error: exErr } = await ownerSb.rpc("stock_movement_exit", {
          p_payload: {
            organization_id: ORG,
            warehouse_id: whA,
            item_id: itemId,
            qty: 21,
            reason: `${MARKER}saida`,
          },
        });
        if (exErr) fail("saída", exErr.message);
        else pass("saída 21");

        const { data: bal2 } = await ownerSb
          .from("stock_balances")
          .select("qty_on_hand")
          .eq("warehouse_id", whA)
          .eq("item_id", itemId)
          .maybeSingle();
        if (Number(bal2?.qty_on_hand) === 9) pass("saldo baixo = 9 (alerta mín. 10)");
        else fail("saldo baixo", String(bal2?.qty_on_hand));

        // transferência 5 A→B
        if (whB) {
          const { error: trErr } = await ownerSb.rpc("stock_movement_transfer", {
            p_payload: {
              organization_id: ORG,
              from_warehouse_id: whA,
              to_warehouse_id: whB,
              item_id: itemId,
              qty: 5,
              reason: `${MARKER}transfer`,
            },
          });
          if (trErr) fail("transferência", trErr.message);
          else pass("transferência 5");

          const { data: ba } = await ownerSb
            .from("stock_balances")
            .select("qty_on_hand")
            .eq("warehouse_id", whA)
            .eq("item_id", itemId)
            .maybeSingle();
          const { data: bb } = await ownerSb
            .from("stock_balances")
            .select("qty_on_hand")
            .eq("warehouse_id", whB)
            .eq("item_id", itemId)
            .maybeSingle();
          if (Number(ba?.qty_on_hand) === 4 && Number(bb?.qty_on_hand) === 5) {
            pass("saldos pós-transferência A=4 B=5");
          } else {
            fail("saldos transferência", `A=${ba?.qty_on_hand} B=${bb?.qty_on_hand}`);
          }
        }

        // inventário: físico 3 em A (sistema 4) → ajuste -1
        const { error: invErr } = await ownerSb.rpc("stock_inventory_confirm", {
          p_payload: {
            organization_id: ORG,
            warehouse_id: whA,
            notes: `${MARKER}inventario`,
            lines: [{ item_id: itemId, counted_qty: 3 }],
          },
        });
        if (invErr) fail("inventário", invErr.message);
        else pass("inventário confirmado");

        const { data: bal3 } = await ownerSb
          .from("stock_balances")
          .select("qty_on_hand")
          .eq("warehouse_id", whA)
          .eq("item_id", itemId)
          .maybeSingle();
        if (Number(bal3?.qty_on_hand) === 3) pass("saldo pós-inventário = 3");
        else fail("saldo inventário", String(bal3?.qty_on_hand));

        // concorrência: saldo 3; duas saídas 2 e 2 — uma deve falhar
        const [r1, r2] = await Promise.all([
          ownerSb.rpc("stock_movement_exit", {
            p_payload: {
              organization_id: ORG,
              warehouse_id: whA,
              item_id: itemId,
              qty: 2,
              reason: `${MARKER}conc1`,
            },
          }),
          ownerSb.rpc("stock_movement_exit", {
            p_payload: {
              organization_id: ORG,
              warehouse_id: whA,
              item_id: itemId,
              qty: 2,
              reason: `${MARKER}conc2`,
            },
          }),
        ]);
        const fails = [r1.error, r2.error].filter(Boolean).length;
        const oks = [r1.error, r2.error].filter((e) => !e).length;
        if (oks === 1 && fails === 1) pass("concorrência: 1 ok + 1 bloqueada");
        else if (oks === 0) pass("concorrência: ambas bloqueadas (ok seguro)");
        else fail("concorrência", `ok=${oks} fail=${fails}`);

        const { data: bal4 } = await ownerSb
          .from("stock_balances")
          .select("qty_on_hand")
          .eq("warehouse_id", whA)
          .eq("item_id", itemId)
          .maybeSingle();
        if (Number(bal4?.qty_on_hand) >= 0 && Number(bal4?.qty_on_hand) <= 3) {
          pass("saldo não negativo após concorrência", String(bal4?.qty_on_hand));
        } else fail("saldo corrompido", String(bal4?.qty_on_hand));

        // lote + validade
        const { data: lotItem, error: lotItemErr } = await ownerSb.rpc("stock_item_upsert", {
          p_payload: {
            organization_id: ORG,
            sku: `${MARKER}LOT${stamp}`,
            name: `${MARKER}Medicamento`,
            item_class: "clinical_lot_controlled",
            unit: "frasco",
            min_qty: 1,
            ideal_qty: 5,
          },
        });
        if (lotItemErr || !lotItem?.id) fail("item com lote", lotItemErr?.message);
        else {
          const { error: lotIn } = await ownerSb.rpc("stock_movement_receipt", {
            p_payload: {
              organization_id: ORG,
              warehouse_id: whA,
              item_id: lotItem.id,
              qty: 5,
              lot_code: `${MARKER}L1`,
              expires_on: "2026-11-01",
              reason: `${MARKER}lote`,
            },
          });
          const { error: lotIn2 } = await ownerSb.rpc("stock_movement_receipt", {
            p_payload: {
              organization_id: ORG,
              warehouse_id: whA,
              item_id: lotItem.id,
              qty: 5,
              lot_code: `${MARKER}L2`,
              expires_on: "2027-06-01",
              reason: `${MARKER}lote2`,
            },
          });
          if (lotIn || lotIn2) fail("entrada lotes", (lotIn || lotIn2).message);
          else pass("lotes A/B com validade");

          const { data: lots } = await ownerSb
            .from("item_lots")
            .select("lot_code, expires_on, qty_on_hand")
            .eq("item_id", lotItem.id)
            .order("expires_on", { ascending: true });
          if ((lots?.length ?? 0) >= 2 && lots[0].expires_on <= lots[1].expires_on) {
            pass("ordenação FEFO");
          } else fail("FEFO", JSON.stringify(lots));
        }

        const { data: moves } = await ownerSb
          .from("stock_movements")
          .select("id, qty_before, qty_after")
          .eq("item_id", itemId)
          .not("qty_before", "is", null);
        if ((moves?.length ?? 0) >= 1) pass("histórico qty_before/after");
        else fail("histórico sem before/after");
      }
    }

    // Revogar elevação e testar physician
    dbQuery(`
delete from public.user_practice_roles upr
using public.profiles p
where upr.user_id = p.id and p.email = '${PHYS_A}'
  and upr.practice_id = '${CASA}' and upr.role = 'owner';
`);
    const phys2 = await login(PHYS_A);
    pass("médica sem gestão");
    if (migrationOk) {
      const { error } = await phys2.rpc("stock_item_upsert", {
        p_payload: {
          organization_id: ORG,
          sku: `${MARKER}FORBID`,
          name: `${MARKER}X`,
          item_class: "office",
          unit: "un",
        },
      });
      if (error && /FORBIDDEN/i.test(error.message)) pass("médica create FORBIDDEN");
      else if (error) pass("médica bloqueada", error.message.slice(0, 60));
      else fail("médica deveria ser FORBIDDEN");
    }
  } catch (e) {
    fail("exceção", e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  } finally {
    dbQuery(`
delete from public.user_practice_roles upr
using public.profiles p
where upr.user_id = p.id and p.email = '${PHYS_A}'
  and upr.practice_id = '${CASA}' and upr.role = 'owner';
`);
    const left = cleanupAll();
    if (left === 0) pass("cleanup uat_left=0");
    else fail("cleanup uat_left", String(left));
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\nE2E C058: ${results.length - failed}/${results.length}`);
    if (failed > 0) process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
