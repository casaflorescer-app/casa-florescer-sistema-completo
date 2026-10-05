"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buttonClass, fieldClass, ghostButtonClass, StatusMessage } from "@/components/platform/Ui";
import { formatDateTime } from "@/lib/platform/format";
import {
  buildCampaignAudience,
  cancelCampaign,
  checkCampaignOverlap,
  confirmCampaignPrepare,
  createCampaign,
  dismissRelationshipAttention,
  duplicateCampaign,
  fetchContactQueue,
  fetchRelationshipDashboard,
  listCampaignAudience,
  listCampaignTemplates,
  listCampaigns,
  listOpenOpportunities,
  listRelationshipHistory,
  mutateCampaignAudience,
  previewCampaignMessage,
  refreshOpportunities,
  searchPatientsForAudience,
  setOpportunityStatus,
  summarizeIneligibleReasons,
  updateCampaignDraft,
  upsertCampaignTemplate,
  upsertCommunicationPreferences,
} from "@/lib/relationship/directory";
import {
  AUDIENCE_FILTER_LABEL,
  CAMPAIGN_STATUS_LABEL,
  OPPORTUNITY_TYPE_LABEL,
  type AudienceFilter,
  type Campaign,
  type CampaignAudienceRow,
  type CampaignTemplate,
  type CombinedAudienceFilters,
  type ContactQueueRow,
  type DashboardStats,
  type PreviewMessageRow,
  type RelationshipChannel,
  type RelationshipOpportunity,
} from "@/lib/relationship/types";
import { describeChannelAvailability } from "@/lib/relationship/providers";

type Tab =
  | "dashboard"
  | "contact"
  | "opportunities"
  | "campaigns"
  | "templates"
  | "history"
  | "preferences";

export function RelationshipCenter({
  organizationId,
  practiceId,
  canManage,
}: {
  organizationId: string;
  practiceId: string;
  canManage: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<CampaignTemplate[]>([]);
  const [opportunities, setOpportunities] = useState<RelationshipOpportunity[]>([]);
  const [queue, setQueue] = useState<ContactQueueRow[]>([]);
  const [queueTotal, setQueueTotal] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<
    Array<{ id: string; title: string; detail: string | null; createdAt: string; patientName?: string | null }>
  >([]);
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);
  const [audience, setAudience] = useState<CampaignAudienceRow[]>([]);
  const [audienceSummary, setAudienceSummary] = useState<Record<string, unknown> | null>(null);
  const [overlapNotice, setOverlapNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewMessageRow | null>(null);
  const [previewOffset, setPreviewOffset] = useState(0);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [patientQuery, setPatientQuery] = useState("");
  const [patientHits, setPatientHits] = useState<Array<{ id: string; fullName: string; phone: string | null }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAttention, setShowAttention] = useState(false);

  const [draftName, setDraftName] = useState("Nova campanha");
  const [draftObjective, setDraftObjective] = useState("relationship");
  const [draftChannel, setDraftChannel] = useState<RelationshipChannel>("whatsapp");
  const [draftBody, setDraftBody] = useState(
    "Olá, {{primeiro_nome}}!\n\nA Casa Florescer gostaria de lembrar que já faz algum tempo desde seu último atendimento.\n\nSe desejar agendar um novo horário, nossa equipe está à disposição.\n\nCasa Florescer",
  );
  const [draftFilter, setDraftFilter] = useState<AudienceFilter>("combined");
  const [combinedFilters, setCombinedFilters] = useState<CombinedAudienceFilters>({
    inactive_12m: true,
    has_phone: true,
    opt_in: true,
  });
  const [queueFilters, setQueueFilters] = useState<CombinedAudienceFilters>({
    opportunity_pending: true,
  });
  const [templateName, setTemplateName] = useState("Retorno Casa Florescer");
  const [templateBody, setTemplateBody] = useState(
    "Olá, {{primeiro_nome}}! A Casa Florescer gostaria de lembrar que já faz algum tempo desde seu último atendimento.",
  );
  const [prefPatientId, setPrefPatientId] = useState("");

  const reload = useCallback(async () => {
    if (!supabase || !canManage) return;
    const [dash, camps, tpls, opps, hist, contact] = await Promise.all([
      fetchRelationshipDashboard(supabase, organizationId, practiceId),
      listCampaigns(supabase, practiceId),
      listCampaignTemplates(supabase, practiceId),
      listOpenOpportunities(supabase, practiceId),
      listRelationshipHistory(supabase, practiceId),
      fetchContactQueue(supabase, organizationId, practiceId, queueFilters),
    ]);
    if (dash.error) setError(dash.error);
    else {
      setStats(dash.stats);
      if (dash.stats && !dash.stats.attentionDismissed && dash.stats.opportunitiesOpen > 0) {
        setShowAttention(true);
      }
    }
    setCampaigns(camps);
    setTemplates(tpls);
    setOpportunities(opps);
    setHistory(hist);
    if (contact.error) setError(contact.error);
    else {
      setQueue(contact.rows);
      setQueueTotal(contact.total);
    }
  }, [supabase, canManage, organizationId, practiceId, queueFilters]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!supabase || !activeCampaign) {
      setAudience([]);
      setPreview(null);
      return;
    }
    void listCampaignAudience(supabase, activeCampaign.id).then(setAudience);
    void previewCampaignMessage(supabase, activeCampaign.id, 0).then((result) => {
      if (result.error) return;
      setPreview(result.row);
      setPreviewOffset(result.offset);
      setPreviewTotal(result.total);
    });
    void checkCampaignOverlap(supabase, activeCampaign.id).then((result) => {
      if (result.error || !result.result) return;
      const count = Number(result.result.count ?? 0);
      if (count > 0) {
        setOverlapNotice(
          `${count} paciente(s) já incluída(s) em campanha semelhante recentemente.`,
        );
      } else {
        setOverlapNotice(null);
      }
    });
  }, [supabase, activeCampaign]);

  const channelInfo = describeChannelAvailability(draftChannel);
  const eligibleCount = audience.filter((row) => row.eligibilityStatus === "eligible").length;
  const blockedCount = audience.length - eligibleCount;
  const selectedCount = selectedIds.size;
  const selectedEligible = queue.filter(
    (row) => selectedIds.has(row.opportunityId) && !row.campaignOptOut && Boolean(row.phone),
  ).length;
  const selectedIneligible = selectedCount - selectedEligible;

  if (!supabase) {
    return (
      <section className="card">
        <h1 className="page-title">Central de Relacionamentos</h1>
        <p className="page-sub mt-2">Supabase não configurado neste ambiente.</p>
      </section>
    );
  }

  if (!canManage) {
    return (
      <section className="card">
        <h1 className="page-title">Central de Relacionamentos</h1>
        <p className="page-sub mt-2">
          Acesso restrito a sócia, gestora e secretária. Este módulo não faz parte do prontuário clínico.
        </p>
      </section>
    );
  }

  async function onDismissAttention() {
    if (!supabase || !stats?.attentionFingerprint) {
      setShowAttention(false);
      return;
    }
    await dismissRelationshipAttention(supabase, organizationId, practiceId, stats.attentionFingerprint);
    setShowAttention(false);
  }

  async function onRefreshOpportunities() {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    try {
      const result = await refreshOpportunities(supabase, organizationId, practiceId);
      if (result.error) setError(result.error);
      else {
        setNotice(
          `Oportunidades atualizadas. Aniversários: ${result.result?.birthday_created ?? 0}; retornos: ${result.result?.inactive_created ?? 0}; sem agendamento: ${result.result?.no_upcoming_created ?? 0}.`,
        );
        await reload();
      }
    } finally {
      setBusy(false);
    }
  }

  async function onApplyQueueFilters() {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    try {
      const contact = await fetchContactQueue(supabase, organizationId, practiceId, queueFilters);
      if (contact.error) setError(contact.error);
      else {
        setQueue(contact.rows);
        setQueueTotal(contact.total);
        setSelectedIds(new Set());
        setNotice(`${contact.total} pacientes elegíveis para contato.`);
      }
    } finally {
      setBusy(false);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectPage() {
    setSelectedIds(new Set(queue.map((row) => row.opportunityId)));
  }

  function selectAllVisible() {
    selectPage();
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function onCreateTemplate() {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    try {
      const result = await upsertCampaignTemplate(supabase, {
        organization_id: organizationId,
        practice_id: practiceId,
        name: templateName,
        purpose: "relationship",
        channel: draftChannel,
        body: templateBody,
        active: true,
      });
      if (result.error) setError(result.error);
      else {
        setNotice("Modelo salvo.");
        await reload();
      }
    } finally {
      setBusy(false);
    }
  }

  async function onCreateCampaignFromSelection() {
    if (!supabase) return;
    const patientIds = queue
      .filter((row) => selectedIds.has(row.opportunityId) && row.patientId)
      .map((row) => row.patientId as string);
    if (patientIds.length === 0) {
      setError("Selecione ao menos uma paciente.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await createCampaign(supabase, {
        organization_id: organizationId,
        practice_id: practiceId,
        name: draftName,
        objective: draftObjective,
        purpose: draftObjective === "administrative" ? "administrative" : "relationship",
        channel: draftChannel,
        message_body: draftBody,
      });
      if (created.error || !created.campaign) {
        setError(created.error ?? "Falha ao criar campanha.");
        return;
      }
      await updateCampaignDraft(supabase, {
        campaign_id: created.campaign.id,
        audience_filter: "manual",
        message_body: draftBody,
      });
      const built = await buildCampaignAudience(supabase, {
        campaign_id: created.campaign.id,
        audience_filter: "manual",
        patient_ids: patientIds,
      });
      if (built.error) setError(built.error);
      else {
        setAudienceSummary(built.summary);
        setActiveCampaign(created.campaign);
        setNotice(
          `${built.summary?.selected ?? patientIds.length} selecionadas · ${built.summary?.eligible ?? 0} elegíveis · ${built.summary?.ineligible ?? 0} não elegíveis.`,
        );
        setTab("campaigns");
        await reload();
      }
    } finally {
      setBusy(false);
    }
  }

  async function onCreateCampaign() {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createCampaign(supabase, {
        organization_id: organizationId,
        practice_id: practiceId,
        name: draftName,
        objective: draftObjective,
        purpose: draftObjective === "administrative" ? "administrative" : "relationship",
        channel: draftChannel,
        message_body: draftBody,
      });
      if (created.error || !created.campaign) {
        setError(created.error ?? "Falha ao criar campanha.");
        return;
      }
      await updateCampaignDraft(supabase, {
        campaign_id: created.campaign.id,
        audience_filter: draftFilter,
        message_body: draftBody,
        filters: combinedFilters,
      });
      const built = await buildCampaignAudience(supabase, {
        campaign_id: created.campaign.id,
        audience_filter: draftFilter,
        filters: combinedFilters,
      });
      if (built.error) setError(built.error);
      else {
        setAudienceSummary(built.summary);
        setActiveCampaign(created.campaign);
        const reasons = summarizeIneligibleReasons(
          (built.summary?.ineligible_reasons as Record<string, unknown>) ?? null,
        );
        setNotice(
          `${built.summary?.selected ?? 0} selecionadas · ${built.summary?.eligible ?? 0} elegíveis · ${built.summary?.ineligible ?? 0} não elegíveis${reasons ? ` (${reasons})` : ""}.`,
        );
        setTab("campaigns");
        await reload();
      }
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmPrepare() {
    if (!supabase || !activeCampaign) return;
    const confirmed = window.confirm(
      `PREPARAR LOTE para ${eligibleCount} pacientes elegíveis.\n\nCanal: ${activeCampaign.channel}\n\nSIMULAÇÃO — NÃO ENVIADO.\nNenhuma mensagem será enviada de verdade.\n\nConfirmar preparação?`,
    );
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      const result = await confirmCampaignPrepare(supabase, activeCampaign.id);
      if (result.error) setError(result.error);
      else {
        setNotice(String(result.result?.message ?? "Preparação concluída — SIMULAÇÃO — NÃO ENVIADO."));
        await reload();
        const refreshed = (await listCampaigns(supabase, practiceId)).find((c) => c.id === activeCampaign.id);
        setActiveCampaign(refreshed ?? null);
      }
    } finally {
      setBusy(false);
    }
  }

  async function onShiftPreview(delta: number) {
    if (!supabase || !activeCampaign) return;
    const next = Math.max(0, Math.min(previewTotal - 1, previewOffset + delta));
    const result = await previewCampaignMessage(supabase, activeCampaign.id, next);
    if (result.error) setError(result.error);
    else {
      setPreview(result.row);
      setPreviewOffset(result.offset);
      setPreviewTotal(result.total);
    }
  }

  async function onSearchPatients() {
    if (!supabase) return;
    const rows = await searchPatientsForAudience(supabase, organizationId, patientQuery);
    setPatientHits(rows);
  }

  async function onAddPatient(patientId: string) {
    if (!supabase || !activeCampaign) return;
    const result = await mutateCampaignAudience(supabase, {
      campaign_id: activeCampaign.id,
      patient_id: patientId,
      action: "add",
    });
    if (result.error) setError(result.error);
    else {
      setAudience(await listCampaignAudience(supabase, activeCampaign.id));
      await onShiftPreview(0);
    }
  }

  async function onRemovePatient(patientId: string) {
    if (!supabase || !activeCampaign) return;
    const result = await mutateCampaignAudience(supabase, {
      campaign_id: activeCampaign.id,
      patient_id: patientId,
      action: "remove",
    });
    if (result.error) setError(result.error);
    else setAudience(await listCampaignAudience(supabase, activeCampaign.id));
  }

  async function onOptOut() {
    if (!supabase || !prefPatientId.trim()) {
      setError("Informe o ID da paciente para registrar opt-out de campanhas.");
      return;
    }
    setBusy(true);
    try {
      const result = await upsertCommunicationPreferences(supabase, {
        organization_id: organizationId,
        practice_id: practiceId,
        patient_id: prefPatientId.trim(),
        campaign_opt_out: true,
        campaign_opt_out_reason: "Solicitação registrada na Central",
      });
      if (result.error) setError(result.error);
      else {
        setNotice("Opt-out de campanhas registrado.");
        await reload();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5 overflow-x-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">
            Relacionamento · não clínico
          </p>
          <h1 className="page-title mt-1">Central de Relacionamentos</h1>
          <p className="page-sub mt-2 max-w-3xl">
            Ferramenta operacional da Secretaria e da Gestão. Sem acesso a prontuário, SOAP, exames,
            orientações ou receitas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={ghostButtonClass} disabled={busy} onClick={() => void onRefreshOpportunities()}>
            Atualizar oportunidades
          </button>
          <button type="button" className={buttonClass} disabled={busy} onClick={() => setTab("campaigns")}>
            Nova campanha
          </button>
        </div>
      </header>

      <StatusMessage error={error} notice={notice} />

      {showAttention && stats ? (
        <div className="rounded-2xl border border-lotus-200 bg-white px-4 py-4 shadow-sm sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">
                Resumo operacional
              </p>
              <h2 className="mt-1 text-lg font-semibold text-lotus-900">Central de Relacionamentos</h2>
              <p className="mt-2 text-sm text-lotus-700">Você possui:</p>
              <ul className="mt-2 space-y-1 text-sm text-lotus-800">
                <li>{stats.inactive12m} pacientes para retorno</li>
                <li>{stats.birthdayWeek} aniversariantes</li>
                <li>{stats.noUpcoming} sem agendamento futuro</li>
                <li>{stats.opportunitiesPending} oportunidades pendentes</li>
                <li>{stats.campaignsDraft} campanhas em rascunho</li>
              </ul>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={buttonClass}
                onClick={() => {
                  setTab("contact");
                  setShowAttention(false);
                }}
              >
                Ver oportunidades
              </button>
              <button type="button" className={ghostButtonClass} onClick={() => void onDismissAttention()}>
                Dispensar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["dashboard", "Painel"],
            ["contact", "Para contatar"],
            ["opportunities", "Oportunidades"],
            ["campaigns", "Campanhas"],
            ["templates", "Modelos"],
            ["history", "Histórico"],
            ["preferences", "Preferências"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? buttonClass : ghostButtonClass}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {!channelInfo.configured ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-950">
          Provider: <strong>StubProvider — SIMULAÇÃO — NÃO ENVIADO</strong>. É possível preparar lotes,
          mas não há envio real de WhatsApp, e-mail ou push.
        </p>
      ) : null}

      {tab === "dashboard" && stats ? (
        <section className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Oportunidades novas", stats.opportunitiesNew],
              ["Oportunidades pendentes", stats.opportunitiesPending],
              ["Sem consulta ≥ 12 meses", stats.inactive12m],
              ["Aniversários próximos", stats.birthdayWeek],
              ["Sem agendamento futuro", stats.noUpcoming],
              ["Campanhas em rascunho", stats.campaignsDraft],
              ["Campanhas prontas", stats.campaignsReady],
              ["Lotes preparados", stats.dispatchesPrepared],
              ["Mensagens pendentes", stats.messagesPending],
              ["Falhas reais", stats.messagesFailed],
              ["Opt-outs recentes", stats.optOutsRecent],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-lotus-100 bg-white px-4 py-3">
                <p className="text-xs uppercase tracking-[0.12em] text-lotus-500">{label}</p>
                <p className="mt-1 text-2xl font-semibold text-lotus-900">{value}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-lotus-600">
            Indicadores de entrega/conversão não são exibidos enquanto não houver provider real.
            Mensagens com status SENT: {stats.messagesSent} (deve permanecer 0 sem provider).
          </p>
        </section>
      ) : null}

      {tab === "contact" ? (
        <section className="space-y-4">
          <div className="card space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-lotus-900">Pacientes para contatar</h2>
              <p className="text-sm text-lotus-700">{queueTotal} elegíveis para contato</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {(
                [
                  ["birthday", "Aniversário"],
                  ["inactive_12m", "Sem consulta ≥ 12 meses"],
                  ["no_upcoming", "Sem agendamento futuro"],
                  ["opportunity_pending", "Oportunidade pendente"],
                  ["has_phone", "Possui telefone"],
                  ["has_email", "Possui e-mail"],
                  ["opt_in", "Opt-in (sem opt-out)"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm text-lotus-800">
                  <input
                    type="checkbox"
                    checked={Boolean(queueFilters[key])}
                    onChange={(e) =>
                      setQueueFilters((prev) => ({ ...prev, [key]: e.target.checked }))
                    }
                  />
                  {label}
                </label>
              ))}
              <label className="text-sm text-lotus-800">
                Canal preferencial
                <select
                  className={fieldClass}
                  value={queueFilters.preferred_channel || ""}
                  onChange={(e) =>
                    setQueueFilters((prev) => ({
                      ...prev,
                      preferred_channel: e.target.value as RelationshipChannel | "",
                    }))
                  }
                >
                  <option value="">Qualquer</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">E-mail</option>
                  <option value="push">Push</option>
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={buttonClass} disabled={busy} onClick={() => void onApplyQueueFilters()}>
                Aplicar filtros
              </button>
              <button type="button" className={ghostButtonClass} onClick={selectAllVisible}>
                Selecionar página
              </button>
              <button type="button" className={ghostButtonClass} onClick={clearSelection}>
                Desmarcar todos
              </button>
            </div>
            <p className="text-sm text-lotus-800">
              {selectedCount} selecionadas · {selectedEligible} elegíveis · {selectedIneligible} não elegíveis
            </p>
          </div>

          <div className="card overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-lotus-50 text-lotus-600">
                <tr>
                  <th className="px-3 py-2" />
                  <th className="px-3 py-2">Paciente</th>
                  <th className="px-3 py-2">Telefone</th>
                  <th className="px-3 py-2">Canal</th>
                  <th className="px-3 py-2">Oportunidade</th>
                  <th className="px-3 py-2">Última consulta</th>
                  <th className="px-3 py-2">Responsável</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {queue.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-4 text-lotus-600">
                      Nenhuma paciente na fila. Atualize oportunidades ou ajuste os filtros.
                    </td>
                  </tr>
                ) : (
                  queue.map((row) => (
                    <tr key={row.opportunityId} className="border-t border-lotus-50">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.opportunityId)}
                          onChange={() => toggleSelect(row.opportunityId)}
                        />
                      </td>
                      <td className="px-3 py-2 font-medium text-lotus-900">{row.patientName || "—"}</td>
                      <td className="px-3 py-2">{row.phone || "—"}</td>
                      <td className="px-3 py-2">{row.preferredChannel}</td>
                      <td className="px-3 py-2">
                        {OPPORTUNITY_TYPE_LABEL[row.opportunityType] || row.opportunityTitle}
                      </td>
                      <td className="px-3 py-2">
                        {row.lastAppointmentAt ? formatDateTime(row.lastAppointmentAt) : "—"}
                      </td>
                      <td className="px-3 py-2">{row.assigneeName || "—"}</td>
                      <td className="px-3 py-2">{row.status}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            className={ghostButtonClass}
                            onClick={() =>
                              void setOpportunityStatus(supabase, row.opportunityId, "CONTACTED").then(reload)
                            }
                          >
                            Tratada
                          </button>
                          <button
                            type="button"
                            className={ghostButtonClass}
                            onClick={() =>
                              void setOpportunityStatus(supabase, row.opportunityId, "DISMISSED").then(reload)
                            }
                          >
                            Dispensar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              disabled={busy || selectedCount === 0}
              onClick={() => void onCreateCampaignFromSelection()}
            >
              Preparar mensagem com selecionadas
            </button>
          </div>
        </section>
      ) : null}

      {tab === "opportunities" ? (
        <section className="card space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-lotus-900">Oportunidades</h2>
            <button type="button" className={ghostButtonClass} disabled={busy} onClick={() => void onRefreshOpportunities()}>
              Gerar/atualizar
            </button>
          </div>
          <ul className="divide-y divide-lotus-100">
            {opportunities.length === 0 ? (
              <li className="py-3 text-sm text-lotus-600">Nenhuma oportunidade aberta.</li>
            ) : (
              opportunities.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-semibold text-lotus-900">
                      {item.title}
                      {item.patientName ? ` · ${item.patientName}` : ""}
                    </p>
                    <p className="text-lotus-600">{item.description}</p>
                    <p className="mt-1 text-xs text-lotus-500">
                      {OPPORTUNITY_TYPE_LABEL[item.opportunityType]} · {item.status}
                      {item.assigneeName ? ` · ${item.assigneeName}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={buttonClass}
                      onClick={() => {
                        setSelectedIds(new Set([item.id]));
                        setTab("contact");
                      }}
                    >
                      Contatar
                    </button>
                    <button
                      type="button"
                      className={ghostButtonClass}
                      disabled={busy}
                      onClick={() => void setOpportunityStatus(supabase, item.id, "DISMISSED").then(reload)}
                    >
                      Dispensar
                    </button>
                  </div>
                </li>
              ))
            )}
          </ul>
        </section>
      ) : null}

      {tab === "templates" ? (
        <section className="card space-y-4">
          <h2 className="text-base font-semibold text-lotus-900">Modelos</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm">
              Nome
              <input className={fieldClass} value={templateName} onChange={(e) => setTemplateName(e.target.value)} />
            </label>
            <label className="text-sm md:col-span-2">
              Corpo
              <textarea className={fieldClass} rows={4} value={templateBody} onChange={(e) => setTemplateBody(e.target.value)} />
            </label>
          </div>
          <p className="text-xs text-lotus-600">
            Variáveis: {"{{primeiro_nome}}"}, {"{{nome}}"}, {"{{nome_clinica}}"}, {"{{telefone_clinica}}"}.
            Variáveis clínicas são bloqueadas.
          </p>
          <button type="button" className={buttonClass} disabled={busy} onClick={() => void onCreateTemplate()}>
            Salvar modelo
          </button>
          <ul className="space-y-2 text-sm">
            {templates.map((tpl) => (
              <li key={tpl.id} className="rounded-lg border border-lotus-100 px-3 py-2">
                <p className="font-semibold text-lotus-900">
                  {tpl.name} · {tpl.channel}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-lotus-700">{tpl.body}</p>
                <button
                  type="button"
                  className={`${ghostButtonClass} mt-2`}
                  onClick={() => {
                    setDraftBody(tpl.body);
                    setDraftChannel(tpl.channel);
                    setTab("campaigns");
                  }}
                >
                  Usar modelo
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tab === "campaigns" ? (
        <section className="space-y-4">
          <div className="card space-y-3">
            <h2 className="text-base font-semibold text-lotus-900">Criar / preparar campanha</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm">
                Nome
                <input className={fieldClass} value={draftName} onChange={(e) => setDraftName(e.target.value)} />
              </label>
              <label className="text-sm">
                Objetivo
                <select className={fieldClass} value={draftObjective} onChange={(e) => setDraftObjective(e.target.value)}>
                  <option value="relationship">Relacionamento</option>
                  <option value="birthday">Aniversário</option>
                  <option value="return">Retorno</option>
                  <option value="campaign">Divulgação</option>
                  <option value="procedure_promo">Procedimento</option>
                  <option value="event">Evento</option>
                  <option value="course">Curso</option>
                  <option value="institutional">Institucional</option>
                  <option value="administrative">Administrativo</option>
                </select>
              </label>
              <label className="text-sm">
                Canal
                <select
                  className={fieldClass}
                  value={draftChannel}
                  onChange={(e) => setDraftChannel(e.target.value as RelationshipChannel)}
                >
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">E-mail</option>
                  <option value="push">Push</option>
                </select>
              </label>
              <label className="text-sm">
                Público
                <select
                  className={fieldClass}
                  value={draftFilter}
                  onChange={(e) => setDraftFilter(e.target.value as AudienceFilter)}
                >
                  {Object.entries(AUDIENCE_FILTER_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {draftFilter === "combined" ? (
                <div className="grid gap-2 sm:grid-cols-2 md:col-span-2">
                  {(
                    [
                      ["inactive_12m", "Sem consulta ≥ 12 meses"],
                      ["birthday", "Aniversário"],
                      ["no_upcoming", "Sem agendamento futuro"],
                      ["opportunity_pending", "Oportunidade pendente"],
                      ["has_phone", "Tem WhatsApp/telefone"],
                      ["opt_in", "Sem opt-out"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(combinedFilters[key])}
                        onChange={(e) =>
                          setCombinedFilters((prev) => ({ ...prev, [key]: e.target.checked }))
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
              ) : null}
              <label className="text-sm md:col-span-2">
                Mensagem
                <textarea className={fieldClass} rows={5} value={draftBody} onChange={(e) => setDraftBody(e.target.value)} />
              </label>
            </div>
            <button type="button" className={buttonClass} disabled={busy} onClick={() => void onCreateCampaign()}>
              Criar e montar audiência
            </button>
          </div>

          {activeCampaign ? (
            <div className="card space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-lotus-900">{activeCampaign.name}</h3>
                  <p className="text-sm text-lotus-600">
                    {CAMPAIGN_STATUS_LABEL[activeCampaign.status]} · {activeCampaign.channel}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={ghostButtonClass}
                    disabled={busy}
                    onClick={() =>
                      void duplicateCampaign(supabase, activeCampaign.id).then(async (result) => {
                        if (result.error) setError(result.error);
                        else {
                          setNotice("Campanha duplicada em rascunho.");
                          await reload();
                          if (result.campaign) setActiveCampaign(result.campaign);
                        }
                      })
                    }
                  >
                    Duplicar
                  </button>
                  <button
                    type="button"
                    className={ghostButtonClass}
                    disabled={busy || activeCampaign.status === "CANCELLED"}
                    onClick={() => void cancelCampaign(supabase, activeCampaign.id).then(reload)}
                  >
                    Cancelar rascunho
                  </button>
                </div>
              </div>

              {audienceSummary ? (
                <p className="text-sm text-lotus-800">
                  {String(audienceSummary.selected)} selecionadas · {String(audienceSummary.eligible)} elegíveis ·{" "}
                  {String(audienceSummary.ineligible)} não elegíveis
                  {audienceSummary.ineligible_reasons
                    ? ` (${summarizeIneligibleReasons(audienceSummary.ineligible_reasons as Record<string, unknown>)})`
                    : ""}
                </p>
              ) : null}
              {overlapNotice ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  Paciente já incluída em campanha semelhante. {overlapNotice}
                </p>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-lotus-800">
                    Audiência · {eligibleCount} elegíveis · {blockedCount} bloqueadas
                  </p>
                  <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-lotus-100">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-lotus-50 text-lotus-600">
                        <tr>
                          <th className="px-3 py-2">Paciente</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {audience.map((row) => (
                          <tr key={row.patientId} className="border-t border-lotus-50">
                            <td className="px-3 py-2">{row.patientName || row.patientId}</td>
                            <td className="px-3 py-2">
                              {row.eligibilityStatus === "eligible"
                                ? "Elegível"
                                : row.exclusionReason || "Inelegível"}
                            </td>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                className={ghostButtonClass}
                                onClick={() => void onRemovePatient(row.patientId)}
                              >
                                Remover
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <input
                      className={fieldClass}
                      placeholder="Buscar paciente"
                      value={patientQuery}
                      onChange={(e) => setPatientQuery(e.target.value)}
                    />
                    <button type="button" className={ghostButtonClass} onClick={() => void onSearchPatients()}>
                      Buscar
                    </button>
                  </div>
                  <ul className="mt-2 space-y-1 text-sm">
                    {patientHits.map((hit) => (
                      <li key={hit.id} className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          {hit.fullName}
                          {hit.phone ? ` · ${hit.phone}` : ""}
                        </span>
                        <button type="button" className={ghostButtonClass} onClick={() => void onAddPatient(hit.id)}>
                          Adicionar
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="min-w-0">
                  <p className="text-sm font-semibold text-lotus-800">Prévia personalizada</p>
                  {preview ? (
                    <div className="mt-2 space-y-2 rounded-xl border border-lotus-100 bg-lotus-50/50 px-4 py-3 text-sm text-lotus-900">
                      <p>
                        Paciente: <strong>{preview.patientName}</strong>
                      </p>
                      <p>Canal: {preview.channel}</p>
                      <p className="whitespace-pre-wrap">{preview.renderedMessage}</p>
                      <div className="flex flex-wrap gap-2 pt-2">
                        <button
                          type="button"
                          className={ghostButtonClass}
                          disabled={previewOffset <= 0}
                          onClick={() => void onShiftPreview(-1)}
                        >
                          Anterior
                        </button>
                        <button
                          type="button"
                          className={ghostButtonClass}
                          disabled={previewOffset >= previewTotal - 1}
                          onClick={() => void onShiftPreview(1)}
                        >
                          Próxima
                        </button>
                        <span className="text-xs text-lotus-600">
                          {previewTotal ? previewOffset + 1 : 0}/{previewTotal}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-lotus-600">Sem audiência para prévia.</p>
                  )}
                  <p className="mt-3 text-xs text-amber-900">
                    O botão abaixo prepara o lote. Não envia WhatsApp real.
                  </p>
                  <button
                    type="button"
                    className={`${buttonClass} mt-3`}
                    disabled={busy || eligibleCount === 0 || Boolean(activeCampaign.audienceFrozenAt)}
                    onClick={() => void onConfirmPrepare()}
                  >
                    Preparar lote (SIMULAÇÃO — NÃO ENVIADO)
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="card">
            <h3 className="text-base font-semibold text-lotus-900">Campanhas recentes</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {campaigns.map((camp) => (
                <li key={camp.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-lotus-100 px-3 py-2">
                  <div>
                    <p className="font-semibold text-lotus-900">{camp.name}</p>
                    <p className="text-lotus-600">
                      {CAMPAIGN_STATUS_LABEL[camp.status]} · {formatDateTime(camp.createdAt)}
                    </p>
                  </div>
                  <button type="button" className={ghostButtonClass} onClick={() => setActiveCampaign(camp)}>
                    Abrir
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {tab === "history" ? (
        <section className="card">
          <h2 className="text-base font-semibold text-lotus-900">Histórico de relacionamento</h2>
          <p className="mt-1 text-sm text-lotus-600">Separado do prontuário clínico.</p>
          <ul className="mt-3 space-y-2 text-sm">
            {history.length === 0 ? (
              <li className="text-lotus-600">Nenhum evento registrado.</li>
            ) : (
              history.map((item) => (
                <li key={item.id} className="rounded-lg border border-lotus-100 px-3 py-2">
                  <p className="font-semibold text-lotus-900">
                    {formatDateTime(item.createdAt)}
                    {item.patientName ? ` · ${item.patientName}` : ""}
                  </p>
                  <p>{item.title}</p>
                  {item.detail ? <p className="text-lotus-600">{item.detail}</p> : null}
                </li>
              ))
            )}
          </ul>
        </section>
      ) : null}

      {tab === "preferences" ? (
        <section className="card space-y-3">
          <h2 className="text-base font-semibold text-lotus-900">Preferências e opt-out</h2>
          <p className="text-sm text-lotus-700">
            Opt-out de campanhas não bloqueia comunicações administrativas necessárias.
          </p>
          <label className="block text-sm">
            Patient ID
            <input className={fieldClass} value={prefPatientId} onChange={(e) => setPrefPatientId(e.target.value)} />
          </label>
          <button type="button" className={buttonClass} disabled={busy} onClick={() => void onOptOut()}>
            Registrar opt-out de campanhas
          </button>
        </section>
      ) : null}
    </div>
  );
}
