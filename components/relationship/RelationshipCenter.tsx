"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buttonClass, fieldClass, ghostButtonClass, StatusMessage } from "@/components/platform/Ui";
import { formatDateTime } from "@/lib/platform/format";
import {
  buildCampaignAudience,
  cancelCampaign,
  confirmCampaignPrepare,
  createCampaign,
  fetchRelationshipDashboard,
  listCampaignAudience,
  listCampaignTemplates,
  listCampaigns,
  listOpenOpportunities,
  listRelationshipHistory,
  mutateCampaignAudience,
  refreshOpportunities,
  renderPreview,
  searchPatientsForAudience,
  setOpportunityStatus,
  updateCampaignDraft,
  upsertCampaignTemplate,
  upsertCommunicationPreferences,
} from "@/lib/relationship/directory";
import {
  AUDIENCE_FILTER_LABEL,
  CAMPAIGN_STATUS_LABEL,
  type AudienceFilter,
  type Campaign,
  type CampaignAudienceRow,
  type CampaignTemplate,
  type DashboardStats,
  type RelationshipChannel,
  type RelationshipOpportunity,
} from "@/lib/relationship/types";
import { describeChannelAvailability } from "@/lib/relationship/providers";

type Tab = "dashboard" | "campaigns" | "templates" | "opportunities" | "history" | "preferences";

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
  // createClient() pode retornar null se env não estiver configurado.
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<CampaignTemplate[]>([]);
  const [opportunities, setOpportunities] = useState<RelationshipOpportunity[]>([]);
  const [history, setHistory] = useState<
    Array<{ id: string; title: string; detail: string | null; createdAt: string; patientName?: string | null }>
  >([]);
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);
  const [audience, setAudience] = useState<CampaignAudienceRow[]>([]);
  const [audienceSummary, setAudienceSummary] = useState<Record<string, unknown> | null>(null);
  const [patientQuery, setPatientQuery] = useState("");
  const [patientHits, setPatientHits] = useState<Array<{ id: string; fullName: string; phone: string | null }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [draftName, setDraftName] = useState("Nova campanha");
  const [draftObjective, setDraftObjective] = useState("relationship");
  const [draftChannel, setDraftChannel] = useState<RelationshipChannel>("whatsapp");
  const [draftBody, setDraftBody] = useState("Olá, {{primeiro_nome}}! Tudo bem? Aqui é a Casa Florescer.");
  const [draftFilter, setDraftFilter] = useState<AudienceFilter>("birthday_today");
  const [templateName, setTemplateName] = useState("Aniversário");
  const [templateBody, setTemplateBody] = useState(
    "Olá, {{primeiro_nome}}! A Casa Florescer deseja um feliz aniversário.",
  );
  const [prefPatientId, setPrefPatientId] = useState("");

  const reload = useCallback(async () => {
    if (!supabase || !canManage) return;
    const [dash, camps, tpls, opps, hist] = await Promise.all([
      fetchRelationshipDashboard(supabase, organizationId, practiceId),
      listCampaigns(supabase, practiceId),
      listCampaignTemplates(supabase, practiceId),
      listOpenOpportunities(supabase, practiceId),
      listRelationshipHistory(supabase, practiceId),
    ]);
    if (dash.error) setError(dash.error);
    else setStats(dash.stats);
    setCampaigns(camps);
    setTemplates(tpls);
    setOpportunities(opps);
    setHistory(hist);
  }, [supabase, canManage, organizationId, practiceId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!supabase || !activeCampaign) {
      setAudience([]);
      return;
    }
    void listCampaignAudience(supabase, activeCampaign.id).then(setAudience);
  }, [supabase, activeCampaign]);

  if (!supabase) {
    return (
      <section className="card">
        <h1 className="page-title">Central de Relacionamentos</h1>
        <p className="page-sub mt-2">Supabase não configurado neste ambiente.</p>
      </section>
    );
  }

  const channelInfo = describeChannelAvailability(draftChannel);
  const eligibleCount = audience.filter((row) => row.eligibilityStatus === "eligible").length;
  const blockedCount = audience.length - eligibleCount;
  const previewName = audience[0]?.patientName || "Maria Silva";
  const previewText = renderPreview(activeCampaign?.messageBody || draftBody, previewName);

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

  async function onRefreshOpportunities() {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    try {
      const result = await refreshOpportunities(supabase, organizationId, practiceId);
      if (result.error) setError(result.error);
      else {
        setNotice(
          `Oportunidades atualizadas. Aniversários: ${result.result?.birthday_created ?? 0}; 12 meses: ${result.result?.inactive_created ?? 0}.`,
        );
        await reload();
      }
    } finally {
      setBusy(false);
    }
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
        purpose: "birthday",
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
      const updated = await updateCampaignDraft(supabase, {
        campaign_id: created.campaign.id,
        audience_filter: draftFilter,
        message_body: draftBody,
      });
      const built = await buildCampaignAudience(supabase, {
        campaign_id: created.campaign.id,
        audience_filter: draftFilter,
      });
      if (built.error) setError(built.error);
      else {
        setAudienceSummary(built.summary);
        setActiveCampaign(updated.campaign ?? created.campaign);
        setNotice("Campanha criada. Revise a audiência antes de confirmar.");
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
      `Você está prestes a PREPARAR uma mensagem para ${eligibleCount} pacientes elegíveis.\n\nCanal: ${activeCampaign.channel}\n\nEnvio real ainda NÃO está configurado. Nenhuma mensagem será enviada.\n\nConfirmar preparação?`,
    );
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      const result = await confirmCampaignPrepare(supabase, activeCampaign.id);
      if (result.error) setError(result.error);
      else {
        setNotice(
          String(result.result?.message ?? "Campanha preparada. SIMULAÇÃO — NÃO ENVIADO."),
        );
        await reload();
        const refreshed = (await listCampaigns(supabase, practiceId)).find((c) => c.id === activeCampaign.id);
        setActiveCampaign(refreshed ?? null);
      }
    } finally {
      setBusy(false);
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
    else setAudience(await listCampaignAudience(supabase, activeCampaign.id));
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
        setNotice("Opt-out de campanhas registrado. Comunicação administrativa permanece separada.");
        await reload();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">
            Relacionamento · não clínico
          </p>
          <h1 className="page-title mt-1">Central de Relacionamentos</h1>
          <p className="page-sub mt-2 max-w-3xl">
            Organize campanhas, aniversários, retornos e oportunidades de contato. Este módulo não
            acessa prontuário, SOAP, exames, orientações ou receitas.
          </p>
        </div>
        <button type="button" className={buttonClass} disabled={busy} onClick={() => setTab("campaigns")}>
          Nova campanha
        </button>
      </header>

      <StatusMessage error={error} notice={notice} />

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["dashboard", "Painel"],
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
          WhatsApp / e-mail / push: <strong>canal ainda não configurado</strong>. É possível preparar
          campanhas, mas não há envio real. StubProvider = SIMULAÇÃO — NÃO ENVIADO.
        </p>
      ) : null}

      {tab === "dashboard" && stats ? (
        <section className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ["Oportunidades abertas", stats.opportunitiesOpen],
              ["Aniversariantes", stats.birthdayToday],
              ["12 meses sem consulta", stats.inactive12m],
              ["Campanhas em rascunho", stats.campaignsDraft],
              ["Campanhas prontas", stats.campaignsReady],
              ["Mensagens pendentes", stats.messagesPending],
              ["Enviadas (provider real)", stats.messagesSent],
              ["Falhas", stats.messagesFailed],
              ["Opt-out campanhas", stats.optOuts],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-lotus-100 bg-white px-4 py-3">
                <p className="text-xs uppercase tracking-[0.12em] text-lotus-500">{label}</p>
                <p className="mt-1 text-2xl font-semibold text-lotus-900">{value}</p>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-lotus-900">Atividades que precisam da sua atenção</h2>
              <button type="button" className={ghostButtonClass} disabled={busy} onClick={() => void onRefreshOpportunities()}>
                Atualizar oportunidades
              </button>
            </div>
            <ul className="mt-3 space-y-2 text-sm text-lotus-800">
              <li>{stats.birthdayToday} pacientes fazem aniversário hoje.</li>
              <li>{stats.inactive12m} pacientes estão há mais de 12 meses sem nova consulta.</li>
              <li>{stats.messagesPending} mensagens aguardam processamento (sem envio real).</li>
              <li>{stats.optOuts} pacientes com opt-out de campanhas.</li>
            </ul>
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
                  <div>
                    <p className="font-semibold text-lotus-900">
                      {item.title}
                      {item.patientName ? ` · ${item.patientName}` : ""}
                    </p>
                    <p className="text-lotus-600">{item.description}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={buttonClass}
                      onClick={() => {
                        setDraftFilter(
                          item.opportunityType === "birthday" ? "birthday_today" : "inactive_12m",
                        );
                        setDraftName(item.title);
                        setTab("campaigns");
                      }}
                    >
                      Preparar campanha
                    </button>
                    <button
                      type="button"
                      className={ghostButtonClass}
                      disabled={busy}
                      onClick={() => void setOpportunityStatus(supabase!, item.id, "DISMISSED").then(reload)}
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
                  <option value="campaign">Campanha</option>
                  <option value="course">Curso</option>
                  <option value="news">Novidade</option>
                  <option value="procedure_promo">Divulgação de procedimento (conteúdo)</option>
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
              <label className="text-sm md:col-span-2">
                Mensagem
                <textarea className={fieldClass} rows={4} value={draftBody} onChange={(e) => setDraftBody(e.target.value)} />
              </label>
            </div>
            <p className="text-xs text-lotus-600">
              Variáveis: {"{{nome}}"}, {"{{primeiro_nome}}"}, {"{{nome_clinica}}"}, {"{{data}}"}. Sem dados clínicos.
            </p>
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
                <button
                  type="button"
                  className={ghostButtonClass}
                  disabled={busy || activeCampaign.status === "CANCELLED"}
                  onClick={() => void cancelCampaign(supabase!, activeCampaign.id).then(reload)}
                >
                  Cancelar campanha
                </button>
              </div>

              {audienceSummary ? (
                <p className="text-sm text-lotus-800">
                  Selecionadas: {String(audienceSummary.selected)} · Elegíveis:{" "}
                  {String(audienceSummary.eligible)} · Inelegíveis: {String(audienceSummary.ineligible)}
                </p>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-2">
                <div>
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

                <div>
                  <p className="text-sm font-semibold text-lotus-800">Prévia</p>
                  <div className="mt-2 rounded-xl border border-lotus-100 bg-lotus-50/50 px-4 py-3 text-sm whitespace-pre-wrap text-lotus-900">
                    {previewText}
                  </div>
                  <p className="mt-3 text-xs text-amber-900">
                    Confirmação prepara a fila. Não marca como enviada sem provider real.
                  </p>
                  <button
                    type="button"
                    className={`${buttonClass} mt-3`}
                    disabled={busy || eligibleCount === 0 || Boolean(activeCampaign.audienceFrozenAt)}
                    onClick={() => void onConfirmPrepare()}
                  >
                    Confirmar preparação
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
