/**
 * C070-C1 — Massa de demonstração completa (Casa Florescer V1).
 *
 * Uso:
 *   node scripts/seed-c070-demo.mjs              # dry-run (padrão, sem write)
 *   node scripts/seed-c070-demo.mjs --apply       # grava (exige env; NÃO usar em prod sem auth)
 *   node scripts/seed-c070-demo.mjs --cleanup     # remove somente DEMO_C070*
 *
 * Env (--apply / --cleanup):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   C070_DEMO_ORG_ID
 *   C070_DEMO_PRACTICE_ID
 *   C070_DEMO_CREATED_BY   (uuid profile existente, usado como created_by)
 *
 * Marcador inequívoco: DEMO_C070 (nomes, SKUs, codes, notes, e-mails @demo.local).
 * Idempotente: reexecução upsert/reusa por chaves naturais.
 *
 * Limitação documentada: não há FK secretária↔médica no schema; workforce
 * Franciele/Mikaela ficam só como funcionários (role_title Secretária).
 */
import { createClient } from "@supabase/supabase-js";

const MARKER = "DEMO_C070";
const TAG = MARKER;
const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const cleanup = args.has("--cleanup");
const dryRun = !apply && !cleanup;

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
  return value;
}

function guardProdUrl(url) {
  const host = String(url).toLowerCase();
  if (host.includes("thvp.cloud") || host.includes("sistema.thvp")) {
    throw new Error(
      "Recusado: URL parece produção (thvp.cloud). C070-C1 não executa --apply/--cleanup em produção sem autorização explícita fora deste script.",
    );
  }
}

/** CPF fictício válido (dígitos verificadores). Base determinística 0–8. */
function demoCpf(n) {
  const base = String(100000000 + n).slice(0, 9);
  const dig = (slice, factorStart) => {
    let sum = 0;
    for (let i = 0; i < slice.length; i++) sum += Number(slice[i]) * (factorStart - i);
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };
  const d1 = dig(base, 10);
  const d2 = dig(base + String(d1), 11);
  return base + String(d1) + String(d2);
}

function isoDayOffset(days, hour = 9, minute = 0) {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function dateOnlyOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Catálogo canônico do seed. */
function buildPlan() {
  return {
    marker: TAG,
    specialties: [
      { slug: "ginecologia", name: "Ginecologia", demoOnly: false },
      { slug: "obstetricia", name: "Obstetrícia", demoOnly: false },
      { slug: "enfermagem-obstetrica", name: "Enfermagem Obstétrica", demoOnly: false },
      { slug: "consultoria-amamentacao", name: "Consultoria de Amamentação", demoOnly: false },
    ],
    professionals: [
      {
        key: "samara",
        full_name: `${TAG}_Samara`,
        email: "demo_c070_samara@demo.local",
        council_type: "CRM",
        council_number: `${TAG}-CRM-SA`,
        specialties: ["ginecologia", "obstetricia"],
      },
      {
        key: "katia",
        full_name: `${TAG}_Katia`,
        email: "demo_c070_katia@demo.local",
        council_type: "CRM",
        council_number: `${TAG}-CRM-KA`,
        specialties: ["ginecologia"],
      },
      {
        key: "thais",
        full_name: `${TAG}_Thais`,
        email: "demo_c070_thais@demo.local",
        council_type: "CRM",
        council_number: `${TAG}-CRM-TH`,
        specialties: ["ginecologia", "obstetricia"],
      },
      {
        key: "barbara",
        full_name: `${TAG}_Barbara`,
        email: "demo_c070_barbara@demo.local",
        council_type: "COREN",
        council_number: `${TAG}-COREN-BA`,
        specialties: ["enfermagem-obstetrica", "consultoria-amamentacao"],
      },
      {
        key: "daiara",
        full_name: `${TAG}_Daiara`,
        email: "demo_c070_daiara@demo.local",
        council_type: "COREN",
        council_number: `${TAG}-COREN-DA`,
        specialties: ["enfermagem-obstetrica", "consultoria-amamentacao"],
      },
    ],
    workforce: [
      {
        full_name: `${TAG}_Franciele`,
        role_title: "Secretária",
        email: "demo_c070_franciele@demo.local",
        notes: `${TAG} secretária (sem vínculo schema com médicas)`,
      },
      {
        full_name: `${TAG}_Mikaela`,
        role_title: "Secretária",
        email: "demo_c070_mikaela@demo.local",
        notes: `${TAG} secretária (sem vínculo schema com médicas)`,
      },
    ],
    rooms: [
      {
        code: `${TAG}_GIN01`,
        name: `${TAG} Consultório Ginecologia 01`,
        room_kind: "house_consultorio",
        is_house: true,
      },
      {
        code: `${TAG}_GO02`,
        name: `${TAG} Consultório Ginecologia/Obstetrícia 02`,
        room_kind: "house_consultorio",
        is_house: true,
      },
      {
        code: `${TAG}_PROC`,
        name: `${TAG} Sala de Procedimentos`,
        room_kind: "procedure",
        is_house: false,
      },
      {
        code: `${TAG}_SUBLET`,
        name: `${TAG} Consultório Locado Demo`,
        room_kind: "sublet_consultorio",
        is_house: false,
      },
    ],
    patients: [
      { key: "gyn1", full_name: `${TAG}_Ana Gineco Um`, cpf: demoCpf(1), care: ["gynecology"] },
      { key: "gyn2", full_name: `${TAG}_Beatriz Gineco Dois`, cpf: demoCpf(2), care: ["gynecology"] },
      { key: "gyn3", full_name: `${TAG}_Carla Gineco Tres`, cpf: demoCpf(3), care: ["gynecology"] },
      { key: "obs1", full_name: `${TAG}_Diana Obstetrica Um`, cpf: demoCpf(4), care: ["obstetrics"] },
      { key: "obs2", full_name: `${TAG}_Elena Obstetrica Dois`, cpf: demoCpf(5), care: ["obstetrics"] },
      { key: "obs3", full_name: `${TAG}_Fabiana Obstetrica Tres`, cpf: demoCpf(6), care: ["obstetrics"] },
      { key: "proc1", full_name: `${TAG}_Gina Procedimento`, cpf: demoCpf(7), care: ["gynecology"] },
    ],
    procedures: [
      {
        code: `${TAG}_COLPO`,
        name: `${TAG} Colposcopia`,
        duration_min: 30,
      },
      {
        code: `${TAG}_LASER`,
        name: `${TAG} Procedimento laser`,
        duration_min: 45,
      },
    ],
    warehouse: { code: `${TAG}_WH`, name: `${TAG} Depósito central` },
    items: [
      {
        sku: `${TAG}_ACIDO_FOLICO`,
        name: `${TAG} Ácido fólico`,
        item_class: "clinical_lot_controlled",
        min: 10,
        ideal: 40,
        lots: true,
      },
      {
        sku: `${TAG}_DIPIRONA`,
        name: `${TAG} Dipirona`,
        item_class: "clinical_lot_controlled",
        min: 10,
        ideal: 50,
        lots: true,
      },
      {
        sku: `${TAG}_PARACETAMOL`,
        name: `${TAG} Paracetamol`,
        item_class: "clinical_lot_controlled",
        min: 10,
        ideal: 40,
        lots: false,
      },
      {
        sku: `${TAG}_LUVA`,
        name: `${TAG} Luva cirúrgica`,
        item_class: "surgical_consumable",
        min: 20,
        ideal: 100,
        lots: false,
      },
      {
        sku: `${TAG}_GAZE`,
        name: `${TAG} Gaze`,
        item_class: "surgical_consumable",
        min: 20,
        ideal: 80,
        lots: false,
      },
      {
        sku: `${TAG}_CAMPO`,
        name: `${TAG} Campo cirúrgico`,
        item_class: "surgical_consumable",
        min: 5,
        ideal: 20,
        lots: false,
      },
      {
        sku: `${TAG}_PAPEL_A4`,
        name: `${TAG} Papel A4`,
        item_class: "office",
        min: 2,
        ideal: 10,
        lots: false,
      },
      {
        sku: `${TAG}_MATERIAL_ESC`,
        name: `${TAG} Material de escritório`,
        item_class: "office",
        min: 1,
        ideal: 5,
        lots: false,
      },
      {
        sku: `${TAG}_CAFE`,
        name: `${TAG} Café`,
        item_class: "pantry",
        min: 2,
        ideal: 8,
        lots: false,
      },
      {
        sku: `${TAG}_AGUA`,
        name: `${TAG} Água`,
        item_class: "pantry",
        min: 6,
        ideal: 24,
        lots: false,
      },
    ],
    equipment: [
      {
        name: `${TAG} Monitor fetal`,
        asset_tag: `${TAG}-EQ-001`,
        category: "obstetrico",
      },
    ],
    rental: {
      contract_code: `${TAG}-ALUG-0001`,
      tenant_name: `${TAG}_Locataria Demo`,
      tenant_specialty: "Ginecologia",
      monthly_rent_cents: 250000,
      due_day: 10,
      notes: `${TAG} contrato de locação fictício`,
    },
    agenda: {
      past_days: [-14, -7],
      near_days: [0, 1],
      future_days: [7, 14],
    },
  };
}

function logPlan(plan) {
  console.log(
    JSON.stringify(
      {
        marker: plan.marker,
        counts: {
          specialties: plan.specialties.length,
          professionals: plan.professionals.length,
          workforce: plan.workforce.length,
          rooms: plan.rooms.length,
          patients: plan.patients.length,
          procedures: plan.procedures.length,
          items: plan.items.length,
          equipment: plan.equipment.length,
          rental_contracts: 1,
          pregnancies: 1,
          appointments_slots:
            plan.agenda.past_days.length +
            plan.agenda.near_days.length +
            plan.agenda.future_days.length,
        },
        note_secretary_link:
          "Schema sem vínculo secretária↔médica; Franciele/Mikaela só em clinic_workforce.",
      },
      null,
      2,
    ),
  );
}

// ---------------------------------------------------------------------------
// Helpers apply
// ---------------------------------------------------------------------------

async function findBy(supabase, table, column, value, extraEq = {}) {
  let q = supabase.from(table).select("*").eq(column, value);
  for (const [k, v] of Object.entries(extraEq)) q = q.eq(k, v);
  const { data, error } = await q.maybeSingle();
  if (error && error.code !== "PGRST116") throw error;
  return data ?? null;
}

async function ensureAuthProfile(supabase, { email, fullName, orgId }) {
  const list = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (list.error) throw list.error;
  let user = (list.data?.users ?? []).find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    const created = await supabase.auth.admin.createUser({
      email,
      password: `C070-Demo-${email.split("@")[0]}!9x`,
      email_confirm: true,
      user_metadata: { full_name: fullName, demo_marker: TAG },
    });
    if (created.error) throw created.error;
    user = created.data.user;
    console.log(`  auth user CREATE ${email}`);
  } else {
    console.log(`  auth user REUSE ${email}`);
  }

  const existing = await findBy(supabase, "profiles", "id", user.id);
  if (!existing) {
    const { error } = await supabase.from("profiles").insert({
      id: user.id,
      organization_id: orgId,
      full_name: fullName,
      email,
      is_active: true,
    });
    if (error) throw error;
    console.log(`  profile CREATE ${fullName}`);
  } else {
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName, organization_id: orgId, is_active: true, email })
      .eq("id", user.id);
    if (error) throw error;
    console.log(`  profile UPDATE ${fullName}`);
  }
  return user.id;
}

async function ensureSpecialty(supabase, orgId, createdBy, spec) {
  const bySlug = await findBy(supabase, "clinic_specialties", "slug", spec.slug, {
    organization_id: orgId,
  });
  if (bySlug) {
    console.log(`  specialty REUSE ${spec.slug}`);
    return bySlug.id;
  }
  // tenta por nome (evitar duplicata case-insensitive)
  const { data: byName } = await supabase
    .from("clinic_specialties")
    .select("id, name, slug")
    .eq("organization_id", orgId)
    .ilike("name", spec.name)
    .maybeSingle();
  if (byName?.id) {
    console.log(`  specialty REUSE-BY-NAME ${byName.name}`);
    return byName.id;
  }
  const { data, error } = await supabase
    .from("clinic_specialties")
    .insert({
      organization_id: orgId,
      name: spec.name,
      slug: spec.slug,
      description: `${TAG} catálogo`,
      is_active: true,
      created_by: createdBy,
    })
    .select("id")
    .single();
  if (error) throw error;
  console.log(`  specialty CREATE ${spec.slug}`);
  return data.id;
}

async function ensureProfessional(supabase, ctx, prof, specialtyIdsBySlug) {
  const existing = await findBy(supabase, "professionals", "council_number", prof.council_number, {
    practice_id: ctx.practiceId,
    council_type: prof.council_type,
  });
  const profileId = await ensureAuthProfile(supabase, {
    email: prof.email,
    fullName: prof.full_name,
    orgId: ctx.orgId,
  });
  let professionalId = existing?.id;
  if (!existing) {
    const { data, error } = await supabase
      .from("professionals")
      .insert({
        profile_id: profileId,
        practice_id: ctx.practiceId,
        organization_id: ctx.orgId,
        council_type: prof.council_type,
        council_number: prof.council_number,
      })
      .select("id")
      .single();
    if (error) throw error;
    professionalId = data.id;
    console.log(`  professional CREATE ${prof.key}`);
  } else {
    await supabase
      .from("professionals")
      .update({ profile_id: profileId })
      .eq("id", existing.id);
    console.log(`  professional REUSE ${prof.key}`);
  }

  for (const slug of prof.specialties) {
    const specialtyId = specialtyIdsBySlug.get(slug);
    if (!specialtyId) continue;
    const { data: link } = await supabase
      .from("professional_specialties")
      .select("id")
      .eq("professional_id", professionalId)
      .eq("specialty_id", specialtyId)
      .maybeSingle();
    if (!link) {
      const { error } = await supabase.from("professional_specialties").insert({
        organization_id: ctx.orgId,
        professional_id: professionalId,
        specialty_id: specialtyId,
        is_primary: slug === prof.specialties[0],
      });
      if (error) console.warn(`  specialty link WARN ${prof.key}/${slug}: ${error.message}`);
      else console.log(`  specialty link ${prof.key}→${slug}`);
    }
  }
  return professionalId;
}

async function ensureWorkforce(supabase, orgId, createdBy, row) {
  const { data: existing } = await supabase
    .from("clinic_workforce")
    .select("id")
    .eq("organization_id", orgId)
    .eq("full_name", row.full_name)
    .maybeSingle();
  if (existing) {
    await supabase
      .from("clinic_workforce")
      .update({
        role_title: row.role_title,
        email: row.email,
        notes: row.notes,
        status: "active",
        engagement_kind: "employee",
      })
      .eq("id", existing.id);
    console.log(`  workforce REUSE ${row.full_name}`);
    return existing.id;
  }
  const { data, error } = await supabase
    .from("clinic_workforce")
    .insert({
      organization_id: orgId,
      full_name: row.full_name,
      role_title: row.role_title,
      email: row.email,
      notes: row.notes,
      status: "active",
      engagement_kind: "employee",
      created_by: createdBy,
    })
    .select("id")
    .single();
  if (error) throw error;
  console.log(`  workforce CREATE ${row.full_name}`);
  return data.id;
}

async function ensureRoom(supabase, orgId, room) {
  const existing = await findBy(supabase, "rooms", "code", room.code, {
    organization_id: orgId,
  });
  if (existing) {
    await supabase
      .from("rooms")
      .update({
        name: room.name,
        room_kind: room.room_kind,
        is_house: room.is_house,
        status: "active",
      })
      .eq("id", existing.id);
    console.log(`  room REUSE ${room.code}`);
    return existing.id;
  }
  const { data, error } = await supabase
    .from("rooms")
    .insert({
      organization_id: orgId,
      code: room.code,
      name: room.name,
      room_kind: room.room_kind,
      is_house: room.is_house,
      status: "active",
    })
    .select("id")
    .single();
  if (error) throw error;
  console.log(`  room CREATE ${room.code}`);
  return data.id;
}

async function ensurePatient(supabase, orgId, createdBy, practiceId, patient) {
  let existing = await findBy(supabase, "patients", "cpf", patient.cpf, {
    organization_id: orgId,
  });
  if (!existing) {
    const byName = await findBy(supabase, "patients", "full_name", patient.full_name, {
      organization_id: orgId,
    });
    existing = byName;
  }
  let patientId;
  if (existing) {
    await supabase
      .from("patients")
      .update({
        full_name: patient.full_name,
        phone: `119${patient.cpf.slice(0, 8)}`,
        email: `demo_c070_${patient.key}@demo.local`,
        care_specialties: patient.care,
      })
      .eq("id", existing.id);
    patientId = existing.id;
    console.log(`  patient REUSE ${patient.key}`);
  } else {
    const { data, error } = await supabase
      .from("patients")
      .insert({
        organization_id: orgId,
        full_name: patient.full_name,
        cpf: patient.cpf,
        phone: `119${patient.cpf.slice(0, 8)}`,
        email: `demo_c070_${patient.key}@demo.local`,
        created_by: createdBy,
        care_specialties: patient.care,
        birth_date: "1990-01-15",
      })
      .select("id")
      .single();
    if (error) throw error;
    patientId = data.id;
    console.log(`  patient CREATE ${patient.key}`);
  }
  const { data: link } = await supabase
    .from("patient_practice_links")
    .select("patient_id")
    .eq("patient_id", patientId)
    .eq("practice_id", practiceId)
    .maybeSingle();
  if (!link) {
    await supabase.from("patient_practice_links").insert({
      patient_id: patientId,
      practice_id: practiceId,
    });
  }
  return patientId;
}

async function ensureProcedure(supabase, orgId, practiceId, proc) {
  const existing = await findBy(supabase, "procedures", "code", proc.code, {
    organization_id: orgId,
  });
  if (existing) {
    console.log(`  procedure REUSE ${proc.code}`);
    return existing.id;
  }
  const { data, error } = await supabase
    .from("procedures")
    .insert({
      organization_id: orgId,
      practice_id: practiceId,
      code: proc.code,
      name: proc.name,
      duration_min: proc.duration_min,
      is_shared: false,
    })
    .select("id")
    .single();
  if (error) throw error;
  console.log(`  procedure CREATE ${proc.code}`);
  return data.id;
}

async function ensureWarehouse(supabase, orgId, wh) {
  const existing = await findBy(supabase, "warehouses", "code", wh.code, {
    organization_id: orgId,
  });
  if (existing) {
    console.log(`  warehouse REUSE ${wh.code}`);
    return existing.id;
  }
  const { data, error } = await supabase
    .from("warehouses")
    .insert({
      organization_id: orgId,
      code: wh.code,
      name: wh.name,
      handles_clinical: true,
      handles_pantry: true,
    })
    .select("id")
    .single();
  if (error) throw error;
  console.log(`  warehouse CREATE ${wh.code}`);
  return data.id;
}

async function ensureItem(supabase, orgId, item) {
  const existing = await findBy(supabase, "items", "sku", item.sku, {
    organization_id: orgId,
  });
  if (existing) {
    await supabase
      .from("items")
      .update({
        name: item.name,
        item_class: item.item_class,
        min_qty: item.min,
        ideal_qty: item.ideal,
        unit: "un",
      })
      .eq("id", existing.id);
    console.log(`  item REUSE ${item.sku}`);
    return existing.id;
  }
  const { data, error } = await supabase
    .from("items")
    .insert({
      organization_id: orgId,
      sku: item.sku,
      name: item.name,
      item_class: item.item_class,
      unit: "un",
      min_qty: item.min,
      ideal_qty: item.ideal,
      default_charge_target: "none",
    })
    .select("id")
    .single();
  if (error) throw error;
  console.log(`  item CREATE ${item.sku}`);
  return data.id;
}

async function ensureLot(supabase, itemId, warehouseId, lotCode, expiresOn, qty) {
  const { data: existing } = await supabase
    .from("item_lots")
    .select("id")
    .eq("item_id", itemId)
    .eq("warehouse_id", warehouseId)
    .eq("lot_code", lotCode)
    .maybeSingle();
  if (existing) {
    await supabase
      .from("item_lots")
      .update({ expires_on: expiresOn, qty_on_hand: qty })
      .eq("id", existing.id);
    console.log(`  lot REUSE ${lotCode}`);
    return existing.id;
  }
  const { data, error } = await supabase
    .from("item_lots")
    .insert({
      item_id: itemId,
      warehouse_id: warehouseId,
      lot_code: lotCode,
      expires_on: expiresOn,
      qty_on_hand: qty,
    })
    .select("id")
    .single();
  if (error) throw error;
  console.log(`  lot CREATE ${lotCode}`);
  return data.id;
}

async function ensureBalance(supabase, warehouseId, itemId, qty) {
  const { data: existing } = await supabase
    .from("stock_balances")
    .select("warehouse_id")
    .eq("warehouse_id", warehouseId)
    .eq("item_id", itemId)
    .maybeSingle();
  if (existing) {
    await supabase
      .from("stock_balances")
      .update({ qty_on_hand: qty })
      .eq("warehouse_id", warehouseId)
      .eq("item_id", itemId);
    return;
  }
  await supabase.from("stock_balances").insert({
    warehouse_id: warehouseId,
    item_id: itemId,
    qty_on_hand: qty,
  });
}

async function ensureAppointment(supabase, row) {
  const { data: existing } = await supabase
    .from("appointments")
    .select("id")
    .eq("urgency_note", row.urgency_note)
    .eq("organization_id", row.organization_id)
    .maybeSingle();
  if (existing) {
    await supabase
      .from("appointments")
      .update({
        room_id: row.room_id,
        patient_id: row.patient_id,
        professional_id: row.professional_id,
        procedure_id: row.procedure_id,
        kind: row.kind,
        starts_at: row.starts_at,
        ends_at: row.ends_at,
        scheduled_starts_at: row.starts_at,
        scheduled_ends_at: row.ends_at,
        status: row.status,
      })
      .eq("id", existing.id);
    console.log(`  appointment REUSE ${row.urgency_note}`);
    return existing.id;
  }
  const { data, error } = await supabase
    .from("appointments")
    .insert({
      organization_id: row.organization_id,
      practice_id: row.practice_id,
      room_id: row.room_id,
      patient_id: row.patient_id,
      professional_id: row.professional_id,
      procedure_id: row.procedure_id,
      kind: row.kind,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      scheduled_starts_at: row.starts_at,
      scheduled_ends_at: row.ends_at,
      status: row.status,
      urgency_note: row.urgency_note,
      source: "demo_seed",
      created_by: row.created_by,
    })
    .select("id")
    .single();
  if (error) throw error;
  console.log(`  appointment CREATE ${row.urgency_note}`);
  return data.id;
}

async function ensureEncounter(supabase, row) {
  const { data: existing } = await supabase
    .from("encounters")
    .select("id")
    .eq("appointment_id", row.appointment_id)
    .maybeSingle();
  if (existing) {
    console.log(`  encounter REUSE appt ${row.appointment_id.slice(0, 8)}`);
    return existing.id;
  }
  const { data, error } = await supabase
    .from("encounters")
    .insert({
      organization_id: row.organization_id,
      practice_id: row.practice_id,
      appointment_id: row.appointment_id,
      patient_id: row.patient_id,
      professional_id: row.professional_id,
      procedure_id: row.procedure_id ?? null,
      status: row.status ?? "open",
      pregnancy_id: row.pregnancy_id ?? null,
    })
    .select("id")
    .single();
  if (error) {
    // pregnancy_id só via RPC em alguns ambientes — retry sem pregnancy
    if (row.pregnancy_id) {
      console.warn(`  encounter WARN pregnancy link: ${error.message}; retry sem pregnancy_id`);
      const retry = await supabase
        .from("encounters")
        .insert({
          organization_id: row.organization_id,
          practice_id: row.practice_id,
          appointment_id: row.appointment_id,
          patient_id: row.patient_id,
          professional_id: row.professional_id,
          procedure_id: row.procedure_id ?? null,
          status: row.status ?? "open",
        })
        .select("id")
        .single();
      if (retry.error) throw retry.error;
      if (row.pregnancy_id) {
        const link = await supabase.rpc("link_encounter_to_pregnancy", {
          p_encounter_id: retry.data.id,
          p_pregnancy_id: row.pregnancy_id,
        });
        if (link.error) console.warn(`  pregnancy link RPC WARN: ${link.error.message}`);
      }
      console.log(`  encounter CREATE ${retry.data.id.slice(0, 8)}`);
      return retry.data.id;
    }
    throw error;
  }
  console.log(`  encounter CREATE ${data.id.slice(0, 8)}`);
  return data.id;
}

async function ensurePregnancy(supabase, row) {
  const { data: existing } = await supabase
    .from("pregnancies")
    .select("id")
    .eq("patient_id", row.patient_id)
    .eq("status", "in_care")
    .maybeSingle();
  if (existing) {
    await supabase
      .from("pregnancies")
      .update({
        notes: row.notes,
        primary_professional_id: row.primary_professional_id,
        lmp_date: row.lmp_date,
      })
      .eq("id", existing.id);
    console.log(`  pregnancy REUSE ${existing.id.slice(0, 8)}`);
    return existing.id;
  }
  const { data, error } = await supabase
    .from("pregnancies")
    .insert({
      organization_id: row.organization_id,
      practice_id: row.practice_id,
      patient_id: row.patient_id,
      primary_professional_id: row.primary_professional_id,
      lmp_date: row.lmp_date,
      pregnancy_number: 1,
      risk: "habitual",
      care_started_on: row.care_started_on,
      notes: row.notes,
      status: "in_care",
      created_by: row.created_by,
    })
    .select("id")
    .single();
  if (error) throw error;
  console.log(`  pregnancy CREATE ${data.id.slice(0, 8)}`);
  return data.id;
}

async function ensurePrescription(supabase, row) {
  const { data: existing } = await supabase
    .from("prescriptions")
    .select("id")
    .eq("notes", row.notes)
    .eq("patient_id", row.patient_id)
    .maybeSingle();
  let prescriptionId = existing?.id;
  if (!existing) {
    const { data, error } = await supabase
      .from("prescriptions")
      .insert({
        organization_id: row.organization_id,
        practice_id: row.practice_id,
        patient_id: row.patient_id,
        professional_id: row.professional_id,
        encounter_id: row.encounter_id ?? null,
        status: "draft",
        notes: row.notes,
        created_by: row.created_by,
      })
      .select("id")
      .single();
    if (error) throw error;
    prescriptionId = data.id;
    console.log(`  prescription CREATE`);
  } else {
    console.log(`  prescription REUSE`);
  }
  const { data: items } = await supabase
    .from("prescription_items")
    .select("id")
    .eq("prescription_id", prescriptionId);
  if (!items?.length) {
    await supabase.from("prescription_items").insert({
      prescription_id: prescriptionId,
      medication_name: `${TAG} Ácido fólico 5mg (fictício)`,
      presentation: "comprimido",
      quantity: "30",
      dosage: "1 comprimido",
      frequency: "1x ao dia",
      duration: "30 dias",
      route: "oral",
      instructions: `${TAG} posologia fictícia`,
      sort_order: 0,
    });
  }
  return prescriptionId;
}

async function ensureExamOrder(supabase, row) {
  const { data: existing } = await supabase
    .from("exam_orders")
    .select("id")
    .eq("title", row.title)
    .eq("patient_id", row.patient_id)
    .maybeSingle();
  if (existing) {
    console.log(`  exam_order REUSE`);
    return existing.id;
  }
  const { data, error } = await supabase
    .from("exam_orders")
    .insert({
      organization_id: row.organization_id,
      practice_id: row.practice_id,
      patient_id: row.patient_id,
      requested_by: row.requested_by,
      title: row.title,
      status: "pending",
    })
    .select("id")
    .single();
  if (error) throw error;
  console.log(`  exam_order CREATE`);
  return data.id;
}

async function ensureRental(supabase, row) {
  const existing = await findBy(supabase, "rental_contracts", "contract_code", row.contract_code, {
    organization_id: row.organization_id,
  });
  if (existing) {
    console.log(`  rental REUSE ${row.contract_code}`);
    return existing.id;
  }
  const { data, error } = await supabase
    .from("rental_contracts")
    .insert({
      organization_id: row.organization_id,
      room_id: row.room_id,
      tenant_professional_id: row.tenant_professional_id,
      tenant_name: row.tenant_name,
      tenant_specialty: row.tenant_specialty,
      monthly_rent_cents: row.monthly_rent_cents,
      starts_on: row.starts_on,
      ends_on: row.ends_on,
      status: "active",
      is_active: true,
      due_day: row.due_day,
      contract_code: row.contract_code,
      notes: row.notes,
      created_by: row.created_by,
    })
    .select("id")
    .single();
  if (error) throw error;
  console.log(`  rental CREATE ${row.contract_code}`);
  return data.id;
}

async function ensureEquipment(supabase, orgId, roomId, eq) {
  const { data: existing } = await supabase
    .from("clinic_equipment")
    .select("id")
    .eq("organization_id", orgId)
    .eq("asset_tag", eq.asset_tag)
    .maybeSingle();
  if (existing) {
    console.log(`  equipment REUSE ${eq.asset_tag}`);
    return existing.id;
  }
  const { data, error } = await supabase
    .from("clinic_equipment")
    .insert({
      organization_id: orgId,
      name: eq.name,
      category: eq.category,
      asset_tag: eq.asset_tag,
      room_id: roomId,
      status: "active",
      notes: TAG,
    })
    .select("id")
    .single();
  if (error) {
    console.warn(`  equipment WARN: ${error.message}`);
    return null;
  }
  console.log(`  equipment CREATE ${eq.asset_tag}`);
  return data.id;
}

// ---------------------------------------------------------------------------
// APPLY
// ---------------------------------------------------------------------------

async function runApply(supabase, ctx) {
  const plan = buildPlan();
  console.log("APPLY — garantindo massa DEMO_C070…");

  const specialtyIds = new Map();
  for (const spec of plan.specialties) {
    const id = await ensureSpecialty(supabase, ctx.orgId, ctx.createdBy, spec);
    specialtyIds.set(spec.slug, id);
  }

  const professionalIds = new Map();
  for (const prof of plan.professionals) {
    const id = await ensureProfessional(supabase, ctx, prof, specialtyIds);
    professionalIds.set(prof.key, id);
  }

  for (const w of plan.workforce) {
    await ensureWorkforce(supabase, ctx.orgId, ctx.createdBy, w);
  }

  const roomIds = new Map();
  for (const room of plan.rooms) {
    const id = await ensureRoom(supabase, ctx.orgId, room);
    roomIds.set(room.code, id);
  }

  const patientIds = new Map();
  for (const p of plan.patients) {
    const id = await ensurePatient(supabase, ctx.orgId, ctx.createdBy, ctx.practiceId, p);
    patientIds.set(p.key, id);
  }

  const procedureIds = new Map();
  for (const proc of plan.procedures) {
    const id = await ensureProcedure(supabase, ctx.orgId, ctx.practiceId, proc);
    procedureIds.set(proc.code, id);
  }

  const warehouseId = await ensureWarehouse(supabase, ctx.orgId, plan.warehouse);
  const itemIds = new Map();
  for (const item of plan.items) {
    const id = await ensureItem(supabase, ctx.orgId, item);
    itemIds.set(item.sku, id);
    let qty = item.min * 2;
    if (item.lots) {
      await ensureLot(
        supabase,
        id,
        warehouseId,
        `${TAG}-L1-${item.sku.slice(-6)}`,
        dateOnlyOffset(90),
        25,
      );
      await ensureLot(
        supabase,
        id,
        warehouseId,
        `${TAG}-L2-${item.sku.slice(-6)}`,
        dateOnlyOffset(20),
        15,
      );
      qty = 40;
    }
    await ensureBalance(supabase, warehouseId, id, qty);
  }

  for (const eq of plan.equipment) {
    await ensureEquipment(supabase, ctx.orgId, roomIds.get(`${TAG}_GO02`), eq);
  }

  await ensureRental(supabase, {
    organization_id: ctx.orgId,
    room_id: roomIds.get(`${TAG}_SUBLET`),
    tenant_professional_id: professionalIds.get("katia"),
    tenant_name: plan.rental.tenant_name,
    tenant_specialty: plan.rental.tenant_specialty,
    monthly_rent_cents: plan.rental.monthly_rent_cents,
    starts_on: dateOnlyOffset(-30),
    ends_on: dateOnlyOffset(335),
    due_day: plan.rental.due_day,
    contract_code: plan.rental.contract_code,
    notes: plan.rental.notes,
    created_by: ctx.createdBy,
  });

  const pregnancyId = await ensurePregnancy(supabase, {
    organization_id: ctx.orgId,
    practice_id: ctx.practiceId,
    patient_id: patientIds.get("obs1"),
    primary_professional_id: professionalIds.get("samara"),
    lmp_date: dateOnlyOffset(-90),
    care_started_on: dateOnlyOffset(-60),
    notes: `${TAG} gestação ativa fictícia`,
    created_by: ctx.createdBy,
  });

  const samara = professionalIds.get("samara");
  const katia = professionalIds.get("katia");
  const thais = professionalIds.get("thais");
  const roomGin = roomIds.get(`${TAG}_GIN01`);
  const roomGo = roomIds.get(`${TAG}_GO02`);
  const roomProc = roomIds.get(`${TAG}_PROC`);
  const procColpo = procedureIds.get(`${TAG}_COLPO`);

  const slots = [
    {
      note: `${TAG}_APPT_PAST_GYN`,
      days: -14,
      hour: 9,
      patient: "gyn1",
      professional: samara,
      room: roomGin,
      kind: "consultation",
      procedure_id: null,
      status: "confirmed",
    },
    {
      note: `${TAG}_APPT_PAST_OBS`,
      days: -7,
      hour: 10,
      patient: "obs1",
      professional: samara,
      room: roomGo,
      kind: "consultation",
      procedure_id: null,
      status: "confirmed",
    },
    {
      note: `${TAG}_APPT_TODAY_GYN`,
      days: 0,
      hour: 11,
      patient: "gyn2",
      professional: katia,
      room: roomGin,
      kind: "consultation",
      procedure_id: null,
      status: "scheduled",
    },
    {
      note: `${TAG}_APPT_TOMORROW_OBS`,
      days: 1,
      hour: 14,
      patient: "obs2",
      professional: thais,
      room: roomGo,
      kind: "consultation",
      procedure_id: null,
      status: "scheduled",
    },
    {
      note: `${TAG}_APPT_FUTURE_PROC`,
      days: 7,
      hour: 15,
      patient: "proc1",
      professional: samara,
      room: roomProc,
      kind: "procedure",
      procedure_id: procColpo,
      status: "scheduled",
    },
    {
      note: `${TAG}_APPT_FUTURE_GYN`,
      days: 14,
      hour: 9,
      patient: "gyn3",
      professional: thais,
      room: roomGin,
      kind: "consultation",
      procedure_id: null,
      status: "scheduled",
    },
  ];

  const appointmentIds = {};
  for (const slot of slots) {
    const starts = isoDayOffset(slot.days, slot.hour, 0);
    const ends = isoDayOffset(slot.days, slot.hour, 30);
    const id = await ensureAppointment(supabase, {
      organization_id: ctx.orgId,
      practice_id: ctx.practiceId,
      room_id: slot.room,
      patient_id: patientIds.get(slot.patient),
      professional_id: slot.professional,
      procedure_id: slot.procedure_id,
      kind: slot.kind,
      starts_at: starts,
      ends_at: ends,
      status: slot.status,
      urgency_note: slot.note,
      created_by: ctx.createdBy,
    });
    appointmentIds[slot.note] = id;
  }

  // Encounter ginecológico (passado)
  const encGyn = await ensureEncounter(supabase, {
    organization_id: ctx.orgId,
    practice_id: ctx.practiceId,
    appointment_id: appointmentIds[`${TAG}_APPT_PAST_GYN`],
    patient_id: patientIds.get("gyn1"),
    professional_id: samara,
    procedure_id: null,
    status: "open",
  });

  // Encounter obstétrico com gestação
  const encObs = await ensureEncounter(supabase, {
    organization_id: ctx.orgId,
    practice_id: ctx.practiceId,
    appointment_id: appointmentIds[`${TAG}_APPT_PAST_OBS`],
    patient_id: patientIds.get("obs1"),
    professional_id: samara,
    procedure_id: null,
    status: "open",
    pregnancy_id: pregnancyId,
  });

  // Encounter procedimento (sem open forçado se futuro — usa appointment futuro sem encounter)
  // Cria encounter só para o passado gineco + obs; procedimento futuro permanece só na agenda.

  await ensurePrescription(supabase, {
    organization_id: ctx.orgId,
    practice_id: ctx.practiceId,
    patient_id: patientIds.get("gyn1"),
    professional_id: samara,
    encounter_id: encGyn,
    notes: `${TAG} receita fictícia gineco`,
    created_by: ctx.createdBy,
  });

  await ensureExamOrder(supabase, {
    organization_id: ctx.orgId,
    practice_id: ctx.practiceId,
    patient_id: patientIds.get("gyn1"),
    requested_by: samara,
    title: `${TAG} USG pélvica (solicitação fictícia)`,
  });

  await ensureExamOrder(supabase, {
    organization_id: ctx.orgId,
    practice_id: ctx.practiceId,
    patient_id: patientIds.get("obs1"),
    requested_by: samara,
    title: `${TAG} USG obstétrica (solicitação fictícia)`,
  });

  console.log("\nAPPLY concluído.");
  console.log(`Encounters: gyn=${encGyn.slice(0, 8)} obs=${encObs.slice(0, 8)} pregnancy=${pregnancyId.slice(0, 8)}`);
}

// ---------------------------------------------------------------------------
// CLEANUP (ordem FK)
// ---------------------------------------------------------------------------

async function deleteWhere(supabase, table, column, pattern, extra = {}) {
  let q = supabase.from(table).delete({ count: "exact" }).like(column, pattern);
  for (const [k, v] of Object.entries(extra)) q = q.eq(k, v);
  const { error, count } = await q;
  if (error) {
    console.warn(`  WARN ${table}: ${error.message}`);
    return 0;
  }
  console.log(`  ${table}: ~${count ?? 0}`);
  return count ?? 0;
}

async function runCleanup(supabase, ctx) {
  console.log("CLEANUP — removendo somente DEMO_C070*…");
  const like = `${TAG}%`;

  // prescription items via prescriptions notes
  const { data: rxs } = await supabase
    .from("prescriptions")
    .select("id")
    .like("notes", like)
    .eq("organization_id", ctx.orgId);
  for (const rx of rxs ?? []) {
    await supabase.from("prescription_items").delete().eq("prescription_id", rx.id);
  }
  await deleteWhere(supabase, "prescriptions", "notes", like, { organization_id: ctx.orgId });
  await deleteWhere(supabase, "exam_orders", "title", like, { organization_id: ctx.orgId });

  // encounters via DEMO appointments
  const { data: appts } = await supabase
    .from("appointments")
    .select("id")
    .like("urgency_note", like)
    .eq("organization_id", ctx.orgId);
  for (const a of appts ?? []) {
    await supabase.from("encounters").delete().eq("appointment_id", a.id);
  }
  await deleteWhere(supabase, "appointments", "urgency_note", like, {
    organization_id: ctx.orgId,
  });

  await deleteWhere(supabase, "pregnancies", "notes", like, { organization_id: ctx.orgId });

  // patients + links
  const { data: patients } = await supabase
    .from("patients")
    .select("id")
    .like("full_name", like)
    .eq("organization_id", ctx.orgId);
  for (const p of patients ?? []) {
    await supabase.from("patient_practice_links").delete().eq("patient_id", p.id);
  }
  await deleteWhere(supabase, "patients", "full_name", like, { organization_id: ctx.orgId });

  await deleteWhere(supabase, "rental_contracts", "contract_code", like, {
    organization_id: ctx.orgId,
  });
  await deleteWhere(supabase, "clinic_equipment", "asset_tag", like, {
    organization_id: ctx.orgId,
  });

  // stock
  const { data: items } = await supabase
    .from("items")
    .select("id")
    .like("sku", like)
    .eq("organization_id", ctx.orgId);
  for (const item of items ?? []) {
    await supabase.from("item_lots").delete().eq("item_id", item.id);
    await supabase.from("stock_balances").delete().eq("item_id", item.id);
    await supabase.from("stock_movements").delete().eq("item_id", item.id);
  }
  await deleteWhere(supabase, "items", "sku", like, { organization_id: ctx.orgId });
  await deleteWhere(supabase, "warehouses", "code", like, { organization_id: ctx.orgId });
  await deleteWhere(supabase, "procedures", "code", like, { organization_id: ctx.orgId });
  await deleteWhere(supabase, "rooms", "code", like, { organization_id: ctx.orgId });
  await deleteWhere(supabase, "clinic_workforce", "full_name", like, {
    organization_id: ctx.orgId,
  });

  // professionals + specialties links + auth
  const { data: professionals } = await supabase
    .from("professionals")
    .select("id, profile_id, council_number")
    .like("council_number", like)
    .eq("organization_id", ctx.orgId);
  for (const p of professionals ?? []) {
    await supabase.from("professional_specialties").delete().eq("professional_id", p.id);
  }
  for (const p of professionals ?? []) {
    await supabase.from("professionals").delete().eq("id", p.id);
  }
  console.log(`  professionals: ~${professionals?.length ?? 0}`);

  // specialties criadas com description DEMO (não apaga catálogo org se slug genérico já existia)
  await deleteWhere(supabase, "clinic_specialties", "description", like, {
    organization_id: ctx.orgId,
  });

  const demoEmails = buildPlan().professionals.map((p) => p.email);
  for (const email of demoEmails) {
    const list = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const user = (list.data?.users ?? []).find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (user) {
      await supabase.from("profiles").delete().eq("id", user.id);
      await supabase.auth.admin.deleteUser(user.id);
      console.log(`  auth+profile DELETE ${email}`);
    }
  }

  console.log("CLEANUP concluído (somente marcador DEMO_C070).");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const plan = buildPlan();
console.log("C070-C1 seed DEMO — modo:", dryRun ? "DRY-RUN" : cleanup ? "CLEANUP" : "APPLY");
logPlan(plan);

if (dryRun) {
  console.log("\nOK — dry-run. Nenhum write.");
  console.log("Para gravar (homologação/local): --apply com env.");
  console.log("Para limpar: --cleanup com env.");
  console.log("NÃO execute --apply/--cleanup em produção (sistema.thvp.cloud) sem autorização.");
  process.exit(0);
}

const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
guardProdUrl(url);
const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const orgId = requireEnv("C070_DEMO_ORG_ID");
const practiceId = requireEnv("C070_DEMO_PRACTICE_ID");
const createdBy = requireEnv("C070_DEMO_CREATED_BY");
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const ctx = { orgId, practiceId, createdBy };

try {
  if (cleanup) await runCleanup(supabase, ctx);
  else await runApply(supabase, ctx);
} catch (err) {
  console.error("FAIL —", err instanceof Error ? err.message : err);
  process.exit(1);
}
