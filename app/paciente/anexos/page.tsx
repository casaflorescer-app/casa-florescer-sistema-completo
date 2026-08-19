export default function AnexosPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Enviar exames</h1>
      <p className="text-sm text-lotus-600">
        Tire foto nítida ou envie o PDF. A médica vê antes da consulta. Nada
        disso aparece para outras pacientes.
      </p>
      <label className="card block cursor-pointer text-center">
        <span className="text-sm font-medium text-lotus-800">
          Toque para escolher arquivo
        </span>
        <input type="file" className="sr-only" accept="image/*,.pdf" />
      </label>
    </div>
  );
}
