import { formatCep, formatCpf, formatPhone } from "@/lib/patients/format";
import {
  applyBillingModalityChange,
  BILLING_MODALITY_LABEL,
  BILLING_MODALITIES,
  BRAZIL_UFS,
  CARE_SPECIALTIES,
  CARE_SPECIALTY_LABEL,
  PREFERRED_CHANNEL_LABEL,
  PREFERRED_CHANNELS,
  PRIVATE_PAYMENT_METHOD_LABEL,
  PRIVATE_PAYMENT_METHODS,
  toggleCareSpecialty,
  type BillingModality,
  type PatientCreateInput,
} from "@/lib/patients/directory";
import { fieldClass } from "@/components/platform/Ui";

const labelClass = "text-sm font-medium text-lotus-800";
const sectionTitleClass = "font-semibold text-lotus-900";

export function PatientMpiFields({
  form,
  setForm,
  busy,
  idPrefix,
}: {
  form: PatientCreateInput;
  setForm: (next: PatientCreateInput | ((current: PatientCreateInput) => PatientCreateInput)) => void;
  busy: boolean;
  idPrefix: string;
}) {
  function patch(partial: Partial<PatientCreateInput>) {
    setForm((current) => ({ ...current, ...partial }));
  }

  return (
    <>
      <section className="space-y-4" aria-labelledby={`${idPrefix}-personal-title`}>
        <h2 id={`${idPrefix}-personal-title`} className={sectionTitleClass}>
          Dados pessoais
        </h2>
        <div>
          <label htmlFor={`${idPrefix}-full-name`} className={labelClass}>
            Nome completo
          </label>
          <input
            id={`${idPrefix}-full-name`}
            className={fieldClass}
            value={form.fullName}
            onChange={(event) => patch({ fullName: event.target.value })}
            autoComplete="name"
            required
            minLength={3}
            disabled={busy}
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-social-name`} className={labelClass}>
            Nome social
          </label>
          <input
            id={`${idPrefix}-social-name`}
            className={fieldClass}
            value={form.socialName}
            onChange={(event) => patch({ socialName: event.target.value })}
            disabled={busy}
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-cpf`} className={labelClass}>
            CPF
          </label>
          <input
            id={`${idPrefix}-cpf`}
            className={fieldClass}
            inputMode="numeric"
            value={form.cpf}
            onChange={(event) => patch({ cpf: formatCpf(event.target.value) })}
            disabled={busy}
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-birth-date`} className={labelClass}>
            Data de nascimento
          </label>
          <input
            id={`${idPrefix}-birth-date`}
            type="date"
            className={fieldClass}
            value={form.birthDate}
            onChange={(event) => patch({ birthDate: event.target.value })}
            max={maxIsoDate()}
            disabled={busy}
          />
        </div>
      </section>

      <section className="space-y-4" aria-labelledby={`${idPrefix}-contact-title`}>
        <h2 id={`${idPrefix}-contact-title`} className={sectionTitleClass}>
          Contato
        </h2>
        <div>
          <label htmlFor={`${idPrefix}-phone`} className={labelClass}>
            Telefone
          </label>
          <input
            id={`${idPrefix}-phone`}
            className={fieldClass}
            inputMode="tel"
            value={form.phone}
            onChange={(event) => patch({ phone: formatPhone(event.target.value) })}
            disabled={busy}
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-email`} className={labelClass}>
            E-mail
          </label>
          <input
            id={`${idPrefix}-email`}
            type="email"
            className={fieldClass}
            value={form.email}
            onChange={(event) => patch({ email: event.target.value })}
            autoComplete="email"
            disabled={busy}
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-channel`} className={labelClass}>
            Canal preferencial
          </label>
          <select
            id={`${idPrefix}-channel`}
            className={fieldClass}
            value={form.preferredChannel}
            onChange={(event) =>
              patch({
                preferredChannel: event.target.value as PatientCreateInput["preferredChannel"],
              })
            }
            disabled={busy}
            required
          >
            {PREFERRED_CHANNELS.map((channel) => (
              <option key={channel} value={channel}>
                {PREFERRED_CHANNEL_LABEL[channel]}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="space-y-4" aria-labelledby={`${idPrefix}-address-title`}>
        <h2 id={`${idPrefix}-address-title`} className={sectionTitleClass}>
          Endereço
        </h2>
        <div>
          <label htmlFor={`${idPrefix}-street`} className={labelClass}>
            Logradouro
          </label>
          <input
            id={`${idPrefix}-street`}
            className={fieldClass}
            value={form.addressStreet}
            onChange={(event) => patch({ addressStreet: event.target.value })}
            autoComplete="address-line1"
            disabled={busy}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${idPrefix}-number`} className={labelClass}>
              Número
            </label>
            <input
              id={`${idPrefix}-number`}
              className={fieldClass}
              value={form.addressNumber}
              onChange={(event) => patch({ addressNumber: event.target.value })}
              disabled={busy}
            />
          </div>
          <div>
            <label htmlFor={`${idPrefix}-complement`} className={labelClass}>
              Complemento
            </label>
            <input
              id={`${idPrefix}-complement`}
              className={fieldClass}
              value={form.addressComplement}
              onChange={(event) => patch({ addressComplement: event.target.value })}
              disabled={busy}
            />
          </div>
        </div>
        <div>
          <label htmlFor={`${idPrefix}-district`} className={labelClass}>
            Bairro
          </label>
          <input
            id={`${idPrefix}-district`}
            className={fieldClass}
            value={form.addressDistrict}
            onChange={(event) => patch({ addressDistrict: event.target.value })}
            disabled={busy}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <label htmlFor={`${idPrefix}-city`} className={labelClass}>
              Cidade
            </label>
            <input
              id={`${idPrefix}-city`}
              className={fieldClass}
              value={form.addressCity}
              onChange={(event) => patch({ addressCity: event.target.value })}
              autoComplete="address-level2"
              disabled={busy}
            />
          </div>
          <div>
            <label htmlFor={`${idPrefix}-state`} className={labelClass}>
              UF
            </label>
            <select
              id={`${idPrefix}-state`}
              className={fieldClass}
              value={form.addressState}
              onChange={(event) => patch({ addressState: event.target.value.toUpperCase() })}
              disabled={busy}
            >
              <option value="">—</option>
              {BRAZIL_UFS.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${idPrefix}-cep`} className={labelClass}>
              CEP
            </label>
            <input
              id={`${idPrefix}-cep`}
              className={fieldClass}
              inputMode="numeric"
              value={form.addressCep}
              onChange={(event) => patch({ addressCep: formatCep(event.target.value) })}
              autoComplete="postal-code"
              disabled={busy}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4" aria-labelledby={`${idPrefix}-care-title`}>
        <h2 id={`${idPrefix}-care-title`} className={sectionTitleClass}>
          Atendimento
        </h2>
        <fieldset className="space-y-2">
          <legend className={labelClass}>Especialidades</legend>
          {CARE_SPECIALTIES.map((specialty) => (
            <label key={specialty} className="flex items-center gap-2 text-sm text-lotus-800">
              <input
                type="checkbox"
                checked={form.careSpecialties.includes(specialty)}
                disabled={busy}
                onChange={() =>
                  setForm((current) => ({
                    ...current,
                    careSpecialties: toggleCareSpecialty(current.careSpecialties, specialty),
                  }))
                }
              />
              {CARE_SPECIALTY_LABEL[specialty]}
            </label>
          ))}
        </fieldset>
      </section>

      <section className="space-y-4" aria-labelledby={`${idPrefix}-reception-title`}>
        <h2 id={`${idPrefix}-reception-title`} className={sectionTitleClass}>
          Observações da recepção
        </h2>
        <div>
          <label htmlFor={`${idPrefix}-reception-notes`} className={labelClass}>
            Observações
          </label>
          <textarea
            id={`${idPrefix}-reception-notes`}
            className={`${fieldClass} min-h-24`}
            value={form.receptionNotes}
            onChange={(event) => patch({ receptionNotes: event.target.value })}
            disabled={busy}
          />
        </div>
      </section>

      <section className="space-y-4" aria-labelledby={`${idPrefix}-billing-title`}>
        <h2 id={`${idPrefix}-billing-title`} className={sectionTitleClass}>
          Faturamento
        </h2>
        <div>
          <label htmlFor={`${idPrefix}-billing-modality`} className={labelClass}>
            Modalidade
          </label>
          <select
            id={`${idPrefix}-billing-modality`}
            className={fieldClass}
            value={form.billingModality}
            onChange={(event) => {
              const value = event.target.value as "" | BillingModality;
              setForm((current) => applyBillingModalityChange(current, value));
            }}
            disabled={busy}
          >
            <option value="">Não informado</option>
            {BILLING_MODALITIES.map((modality) => (
              <option key={modality} value={modality}>
                {BILLING_MODALITY_LABEL[modality]}
              </option>
            ))}
          </select>
        </div>

        {form.billingModality === "private" ? (
          <div>
            <label htmlFor={`${idPrefix}-private-payment`} className={labelClass}>
              Forma de pagamento
            </label>
            <select
              id={`${idPrefix}-private-payment`}
              className={fieldClass}
              value={form.privatePaymentMethod}
              onChange={(event) =>
                patch({
                  privatePaymentMethod: event.target.value as PatientCreateInput["privatePaymentMethod"],
                })
              }
              disabled={busy}
            >
              <option value="">Selecione</option>
              {PRIVATE_PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {PRIVATE_PAYMENT_METHOD_LABEL[method]}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {form.billingModality === "insurance" ? (
          <>
            <div>
              <label htmlFor={`${idPrefix}-insurance-name`} className={labelClass}>
                Nome do convênio
              </label>
              <input
                id={`${idPrefix}-insurance-name`}
                className={fieldClass}
                value={form.insuranceName}
                onChange={(event) => patch({ insuranceName: event.target.value })}
                disabled={busy}
              />
            </div>
            <div>
              <label htmlFor={`${idPrefix}-insurance-card`} className={labelClass}>
                Número da carteirinha
              </label>
              <input
                id={`${idPrefix}-insurance-card`}
                className={fieldClass}
                value={form.insuranceCardNumber}
                onChange={(event) => patch({ insuranceCardNumber: event.target.value })}
                disabled={busy}
              />
            </div>
            <div>
              <label htmlFor={`${idPrefix}-insurance-valid`} className={labelClass}>
                Validade da carteirinha
              </label>
              <input
                id={`${idPrefix}-insurance-valid`}
                type="date"
                className={fieldClass}
                value={form.insuranceValidUntil}
                onChange={(event) => patch({ insuranceValidUntil: event.target.value })}
                disabled={busy}
              />
            </div>
          </>
        ) : null}
      </section>
    </>
  );
}

function maxIsoDate() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}
