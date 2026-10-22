"use client";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <h1 className="text-xl font-semibold text-rose-950">Não foi possível abrir esta tela.</h1>
      <p className="mt-3 text-sm text-rose-900">{error.message || "Erro inesperado."}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-xl bg-[#9B406C] px-4 py-2 text-sm font-medium text-white"
      >
        Tentar de novo
      </button>
    </main>
  );
}
