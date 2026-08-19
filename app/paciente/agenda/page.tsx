export default function PacienteAgendaPage() {
  return (
    <div className="space-y-3">
      <h1 className="text-lg font-semibold">Suas consultas</h1>
      <article className="card">
        <p className="font-semibold">20/08 · 9:00</p>
        <p className="text-sm text-lotus-600">Consulta · Dra. Samara · confirmada</p>
      </article>
      <article className="card opacity-70">
        <p className="font-semibold">12/09 · 10:30</p>
        <p className="text-sm text-lotus-600">Retorno anual · agendada</p>
      </article>
    </div>
  );
}
