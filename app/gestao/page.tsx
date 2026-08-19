export default function GestaoHomePage() {
  return (
    <div>
      <h1 className="page-title">Gestão da casa</h1>
      <p className="page-sub">
        Duas salas da casa e três sublocadas. Financeiro e estoque não se
        misturam com o prontuário.
      </p>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <article className="card">
          <p className="text-xs font-semibold uppercase tracking-wide text-lotus-500">
            Salas casa
          </p>
          <p className="mt-2 text-3xl font-semibold">2</p>
        </article>
        <article className="card">
          <p className="text-xs font-semibold uppercase tracking-wide text-lotus-500">
            Sublocadas
          </p>
          <p className="mt-2 text-3xl font-semibold">3</p>
        </article>
        <article className="card">
          <p className="text-xs font-semibold uppercase tracking-wide text-lotus-500">
            Contratos ativos
          </p>
          <p className="mt-2 text-3xl font-semibold">3</p>
        </article>
      </div>
    </div>
  );
}
