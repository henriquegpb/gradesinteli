import { TriangleAlert } from "lucide-react";
import { Button } from "~/ui/Button";

// A sessão do Adalove morre em silêncio. A tela continua inteira na frente da
// pessoa — as notas, o kanban, tudo desenhado com o que já estava em memória —,
// e a única pista de que a sessão acabou era a PRIMEIRA ação falhar. Mover um
// card devolvia 400, que não diz nada a quem só quer estudar.
//
// Faixa, e não diálogo: o que está na tela continua legível e verdadeiro, e
// bloquear a leitura por causa de uma escrita que talvez nem venha seria cobrar
// caro por um aviso. Ela não fecha, porque o problema não passa sozinho.
export function SessionBanner({ onReload }: { onReload: () => void }) {
  return (
    <div
      role="status"
      // `sticky` e não `fixed`: a faixa acompanha a rolagem da página sem sair
      // do fluxo, então nada do conteúdo nasce escondido atrás dela.
      className="sticky top-0 z-[60] mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-yellow/40 bg-surface px-3 py-2.5 shadow-lg"
    >
      <TriangleAlert size={16} aria-hidden className="shrink-0 text-yellow" />
      <p className="min-w-0 flex-1 text-sm text-fg-soft">
        Sua sessão do Adalove expirou. O que está na tela continua valendo, mas mover cartões e
        salvar respostas só volta a funcionar depois de recarregar.
      </p>
      <Button variant="primary" onClick={onReload}>
        Recarregar
      </Button>
    </div>
  );
}
