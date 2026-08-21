import { z } from "zod";
import { isValidCpf, onlyDigits } from "./format";

export const CARE_SPECIALTIES = ["gynecology", "obstetrics"] as const;
export const BILLING_MODALITIES = ["private", "insurance"] as const;
export const PRIVATE_PAYMENT_METHODS = ["pix", "card", "cash"] as const;
export const BRAZIL_UFS = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT",
  "PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO",
] as const;

export type CareSpecialty = (typeof CARE_SPECIALTIES)[number];
export type BillingModality = (typeof BILLING_MODALITIES)[number];
export type PrivatePaymentMethod = (typeof PRIVATE_PAYMENT_METHODS)[number];

const optionalText = z
  .string()
  .trim()
  .transform((v) => v || undefined);

export const patientCadastroSchema = z
  .object({
    fullName: z.string().trim().min(3, "Informe o nome completo."),
    cpf: z
      .string()
      .trim()
      .min(1, "Informe o CPF.")
      .refine((v) => isValidCpf(v), "CPF inválido."),
    birthDate: z
      .string()
      .min(1, "Informe a data de nascimento.")
      .refine((v) => {
        const d = new Date(`${v}T00:00:00`);
        return !Number.isNaN(d.getTime()) && d <= new Date();
      }, "Data de nascimento inválida."),
    phone: z
      .string()
      .trim()
      .min(1, "Informe o WhatsApp.")
      .refine((v) => onlyDigits(v).length >= 10, "Telefone incompleto."),
    email: z
      .string()
      .trim()
      .min(1, "Informe o e-mail.")
      .email("E-mail inválido."),
    addressStreet: z.string().trim().min(2, "Informe o logradouro."),
    addressNumber: z.string().trim().min(1, "Informe o número."),
    addressComplement: optionalText.optional(),
    addressDistrict: z.string().trim().min(2, "Informe o bairro."),
    addressCity: z.string().trim().min(2, "Informe a cidade."),
    addressState: z.enum(BRAZIL_UFS, { errorMap: () => ({ message: "Selecione a UF." }) }),
    addressCep: z
      .string()
      .trim()
      .refine((v) => onlyDigits(v).length === 8, "CEP deve ter 8 dígitos."),
    careSpecialties: z
      .array(z.enum(CARE_SPECIALTIES))
      .min(1, "Selecione ginecologia e/ou obstetrícia."),
    billingModality: z.enum(BILLING_MODALITIES, {
      errorMap: () => ({ message: "Selecione particular ou plano." }),
    }),
    insuranceName: z.string().optional().default(""),
    insuranceCardNumber: z.string().optional().default(""),
    insuranceValidUntil: z.string().optional().default(""),
    privatePaymentMethod: z.enum(PRIVATE_PAYMENT_METHODS).optional(),
    pregnancies: z.coerce.number().int().min(0, "G não pode ser negativo."),
    births: z.coerce.number().int().min(0, "P não pode ser negativo."),
    abortions: z.coerce.number().int().min(0, "A não pode ser negativo."),
    lmpDate: z.string().optional().default(""),
    gynProcedures: z.array(z.string().trim().min(1)).default([]),
    comorbidities: z.string().optional().default(""),
    continuousMedications: z.string().optional().default(""),
    allergies: z.string().optional().default(""),
  })
  .superRefine((data, ctx) => {
    if (data.pregnancies < data.births + data.abortions) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pregnancies"],
        message: "G deve ser maior ou igual a P + A.",
      });
    }
    if (data.careSpecialties.includes("obstetrics") && !data.lmpDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lmpDate"],
        message: "DUM é obrigatória na obstetrícia (calcula a DPP).",
      });
    }
    if (data.billingModality === "insurance") {
      if (!data.insuranceName?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["insuranceName"],
          message: "Informe o convênio.",
        });
      }
      if (!data.insuranceCardNumber?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["insuranceCardNumber"],
          message: "Informe o número da carteirinha.",
        });
      }
      if (!data.insuranceValidUntil) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["insuranceValidUntil"],
          message: "Informe a validade da carteirinha.",
        });
      }
    }
    if (data.billingModality === "private" && !data.privatePaymentMethod) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["privatePaymentMethod"],
        message: "Selecione Pix, cartão ou dinheiro.",
      });
    }
  });

export type PatientCadastroInput = z.input<typeof patientCadastroSchema>;
export type PatientCadastroValues = z.output<typeof patientCadastroSchema>;

export const PATIENT_FORM_STEPS = [
  {
    id: "personal",
    title: "Dados pessoais",
    fields: [
      "fullName",
      "cpf",
      "birthDate",
      "phone",
      "email",
      "addressStreet",
      "addressNumber",
      "addressComplement",
      "addressDistrict",
      "addressCity",
      "addressState",
      "addressCep",
    ] as const,
  },
  {
    id: "billing",
    title: "Faturamento",
    fields: [
      "careSpecialties",
      "billingModality",
      "insuranceName",
      "insuranceCardNumber",
      "insuranceValidUntil",
      "privatePaymentMethod",
    ] as const,
  },
  {
    id: "clinical",
    title: "Histórico clínico",
    fields: [
      "pregnancies",
      "births",
      "abortions",
      "lmpDate",
      "gynProcedures",
      "comorbidities",
      "continuousMedications",
      "allergies",
    ] as const,
  },
] as const;

export const emptyPatientCadastro = (): PatientCadastroInput => ({
  fullName: "",
  cpf: "",
  birthDate: "",
  phone: "",
  email: "",
  addressStreet: "",
  addressNumber: "",
  addressComplement: "",
  addressDistrict: "",
  addressCity: "",
  addressState: "SP",
  addressCep: "",
  careSpecialties: [],
  billingModality: undefined as unknown as BillingModality,
  insuranceName: "",
  insuranceCardNumber: "",
  insuranceValidUntil: "",
  privatePaymentMethod: undefined,
  pregnancies: 0,
  births: 0,
  abortions: 0,
  lmpDate: "",
  gynProcedures: [],
  comorbidities: "",
  continuousMedications: "",
  allergies: "",
});

export const CARE_SPECIALTY_LABEL: Record<CareSpecialty, string> = {
  gynecology: "Ginecologia",
  obstetrics: "Obstetrícia",
};

export const BILLING_MODALITY_LABEL: Record<BillingModality, string> = {
  private: "Particular",
  insurance: "Plano de saúde",
};

export const PAYMENT_METHOD_LABEL: Record<PrivatePaymentMethod, string> = {
  pix: "Pix",
  card: "Cartão",
  cash: "Dinheiro",
};
