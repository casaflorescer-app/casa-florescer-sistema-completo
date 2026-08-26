import { PlatformBanner } from "@/components/platform/Ui";

export function SettingsPanel() {
  return (
    <div>
      <PlatformBanner
        title="Configurações do sistema"
        description="Não existe tabela de configurações no schema atual. Nenhuma migration foi criada nesta fase."
      />
      <section className="card space-y-3 text-sm text-lotus-800">
        <p>
          Este módulo permanece preparado para uma migration posterior. Enquanto isso, nenhum
          parâmetro é gravado na interface.
        </p>
        <p>Não são armazenados secrets, chaves, senhas ou credenciais aqui.</p>
        <p className="text-lotus-600">Requer alteração de banco — não realizada na FASE 7A.</p>
      </section>
    </div>
  );
}
