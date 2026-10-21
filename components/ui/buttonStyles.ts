/** Variantes de botão — identidade lotus preservada (C064 UX). */

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "danger" | "ghost";

const base =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50";

export const buttonVariantClass: Record<ButtonVariant, string> = {
  primary: `${base} bg-lotus-800 text-white hover:bg-lotus-900`,
  secondary: `${base} border border-lotus-200 bg-white text-lotus-800 hover:bg-lotus-50`,
  tertiary: `${base} px-2 text-lotus-800 underline-offset-2 hover:underline`,
  danger: `${base} border border-rose-200 bg-white text-rose-800 hover:bg-rose-50`,
  ghost: `${base} border border-lotus-200 bg-transparent text-lotus-800 hover:bg-lotus-50`,
};

/** Compacto para ações em linha de tabela */
export const buttonCompactClass =
  "min-h-10 px-3 py-1.5 text-sm";

/** Compatível com código legado */
export const buttonClass = buttonVariantClass.primary;
export const ghostButtonClass = buttonVariantClass.ghost;
