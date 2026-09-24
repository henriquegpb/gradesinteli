import { ArrowLeft, ArrowUpRight, Headset, LifeBuoy } from "lucide-react";
import { Card } from "~/ui/Card";

// `/service-channels` é a única rota do menu cujo payload não apareceu em
// nenhuma captura. Mas o destino prático é conhecido: o menu do Adalove
// (`/users/menus`) aponta o FAQ para help.inteli.edu.br, que é o mesmo
// Freshservice de inteli.freshservice.com. Então em vez de forjar um contrato,
// a tela leva direto para os canais — que é o que a página deles faz.

interface Channel {
  label: string;
  description: string;
  url: string;
  icon: typeof Headset;
}

const CHANNELS: Channel[] = [
  {
    label: "Central de ajuda",
    description: "Base de conhecimento e abertura de chamados para o time do Inteli.",
    url: "https://help.inteli.edu.br/support/home",
    icon: LifeBuoy,
  },
  {
    label: "Portal de chamados",
    description: "Mesmo atendimento pelo domínio do Freshservice, se o link acima falhar.",
    url: "https://inteli.freshservice.com/support/home",
    icon: Headset,
  },
];

export function Atendimento({ onBack }: { onBack?: () => void }) {
  return (
    <div className="space-y-4">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs text-fg-muted transition-colors hover:text-fg"
        >
          <ArrowLeft size={13} aria-hidden />
          Acadêmico
        </button>
      )}

      <h1 className="text-xl font-medium text-fg">Atendimento</h1>
      <p className="text-xs text-fg-muted">
        O atendimento do Inteli fica fora do Adalove: estes links abrem em outra aba.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {CHANNELS.map((channel) => {
          const Icon = channel.icon;
          return (
            <a
              key={channel.url}
              href={channel.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col rounded-card border border-line bg-surface p-4 transition-colors duration-150 hover:border-accent"
            >
              <div className="flex items-start gap-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-control border border-line bg-bg">
                  <Icon size={16} aria-hidden className="text-accent" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-fg">{channel.label}</span>
                    <ArrowUpRight size={12} aria-hidden className="shrink-0 text-fg-muted" />
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-fg-soft">
                    {channel.description}
                  </p>
                </div>
              </div>
              <span className="mt-3 truncate font-mono text-[0.62rem] text-fg-muted">
                {new URL(channel.url).host}
              </span>
            </a>
          );
        })}
      </div>

      <Card className="p-4">
        <p className="text-xs leading-relaxed text-fg-muted">
          A página <span className="font-mono text-fg-soft">/service-channels</span> do Adalove foi a
          única que não apareceu nas capturas, então o conteúdo dela não foi reconstruído aqui. Se
          quiser essa tela completa, ligue o modo de captura e abra Atendimento no Adalove.
        </p>
      </Card>
    </div>
  );
}
