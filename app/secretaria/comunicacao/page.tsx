export default function ComunicacaoPage() {
  return (
    <div>
      <h1 className="page-title">Automação de comunicação</h1>
      <p className="page-sub">
        Lembrete de retorno anual e mensagens de cancelamento/reagendamento.
        Canal preferido da paciente (WhatsApp por padrão).
      </p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <section className="card">
          <h2 className="font-semibold">Retornos anuais</h2>
          <p className="mt-2 text-sm text-lotus-700">
            12 pacientes com retorno em setembro. Disparo sugerido: 15 dias
            antes, às 10h.
          </p>
          <button type="button" className="mt-4 rounded-xl bg-lotus-700 px-4 py-2 text-sm font-semibold text-white">
            Programar disparo
          </button>
        </section>
        <section className="card">
          <h2 className="font-semibold">Cancelamento / remarcação</h2>
          <p className="mt-2 text-sm text-lotus-700">
            Modelo pronto: “Sua consulta foi remarcada para [data]. Responda
            SIM para confirmar.”
          </p>
        </section>
      </div>
    </div>
  );
}
