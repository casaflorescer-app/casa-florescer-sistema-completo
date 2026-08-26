export function AccessDenied({
  title = "Acesso não autorizado",
  message = "Seu usuário não possui permissão para acessar esta área.",
}: {
  title?: string;
  message?: string;
}) {
  return (
    <section className="card max-w-xl" role="alert">
      <h1 className="page-title">{title}</h1>
      <p className="page-sub mt-3">{message}</p>
      <p className="mt-4 text-sm text-lotus-700">
        Se você acredita que deveria ter acesso, fale com a administração da plataforma
        ou da clínica.
      </p>
    </section>
  );
}
