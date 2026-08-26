export function ModulePlaceholder({
  title,
  description = "Módulo em implementação.",
  area,
}: {
  title: string;
  description?: string;
  area?: "plataforma" | "clinica" | "paciente";
}) {
  const areaLabel =
    area === "plataforma"
      ? "Administração da plataforma"
      : area === "paciente"
        ? "Portal da paciente"
        : area === "clinica"
          ? "Gestão da clínica"
          : null;

  return (
    <div>
      {areaLabel ? (
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">
          {areaLabel}
        </p>
      ) : null}
      <h1 className="page-title mt-1">{title}</h1>
      <p className="page-sub mt-3">{description}</p>
      <section className="card mt-6 text-sm text-lotus-700">
        <p>
          Esta tela estabelece a rota e a autorização do módulo. As funcionalidades internas serão
          implementadas nas fases seguintes, sem alterar o modelo de acesso já validado.
        </p>
      </section>
    </div>
  );
}
