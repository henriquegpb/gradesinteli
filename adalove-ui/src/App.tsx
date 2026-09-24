import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_SIMULACAO } from "@/lib/storage";
import {
  DEFAULT_PARTICIPACAO_MULTIPLIERS,
  type ParticipacaoLetra,
  type ParticipacaoMultipliers,
  type SimulacaoConfig,
} from "@/types/grades";
import { ApiProvider, useApiClient, type ApiClient } from "~/data/api";
import { AdaloveAuthError, type AdaloveUser } from "~/data/client";
import { normalizeNews, type NewsItem } from "~/data/news";
import { getPref, setPref } from "~/lib/prefs";
import type { Theme } from "~/shell/HeaderActions";
import { STATUS_DONE, type ActivityStatus, type RawUserdata } from "~/data/types";
import { buildSectionView, type ActivityView } from "~/data/viewmodel";
import { ActivityModal } from "~/screens/ActivityModal";
import { Atividades } from "~/screens/Atividades";
import { Grupo } from "~/screens/Grupo";
import { Atendimento } from "~/screens/Atendimento";
import { Cardapio } from "~/screens/Cardapio";
import { Carreiras } from "~/screens/Carreiras";
import { Financeiro } from "~/screens/Financeiro";
import { Historico } from "~/screens/Historico";
import { Intercambio } from "~/screens/Intercambio";
import { NaoEncontrada } from "~/screens/NaoEncontrada";
import { Noticias } from "~/screens/Noticias";
import { Pagina, type PageSlug } from "~/screens/Pagina";
import { Perfil } from "~/screens/Perfil";
import { ProvaFinal } from "~/screens/ProvaFinal";
import { Simulados } from "~/screens/Simulados";
import { Overview } from "~/screens/Overview";
import { Footer } from "~/shell/Footer";
import { SessionBanner } from "~/shell/SessionBanner";
import { Sidebar } from "~/shell/Sidebar";
import type { RouteId } from "~/shell/nav";
import { onHistoryRoute, pushRoute } from "~/shell/history";
import { routeForPath } from "~/shell/routes";
import { ConfirmDialog } from "~/ui/ConfirmDialog";
import { ToastProvider, useToast } from "~/ui/Toast";

export interface AppProps {
  raw: RawUserdata;
  /** Ausente no harness de dev; presente na extensão. Voltar para a UI do Adalove. */
  onExit?: () => void;
  /** Persiste a mudança de coluna. Se ausente, o kanban fica só de leitura. */
  persistStatus?: (
    studentActivityUuid: string,
    status: ActivityStatus,
    sort: number,
  ) => Promise<unknown>;
  /** Persiste a resposta da atividade. Se ausente, a resposta fica só de leitura. */
  persistAnswer?: (studentActivityUuid: string, answerHtml: string) => Promise<unknown>;
  /** Tela inicial, quando explícita: o harness de dev usa `?route=`. Na extensão
   *  fica ausente e quem manda é a URL (`~/shell/routes`). */
  initialRoute?: RouteId;
  /** Notícias do Adalove. Ausente no dev: o card mostra o estado vazio. */
  fetchNews?: () => Promise<unknown>;
  /** Usuário logado, lido do localStorage do Adalove. */
  user?: AdaloveUser | null;
  /** Encerra a sessão do Adalove. Ausente no harness de dev. */
  onLogout?: () => void;
  /** Cliente das telas novas: rede na extensão, fixture no harness de dev. */
  api: ApiClient;
}

/** Levar uma atividade PONDERADA para Feito é o único movimento do kanban que
 *  não dá para desfazer: o Adalove tranca a resposta junto com a coluna (é o que
 *  o `ActivityModal` já reflete ao mostrar a resposta como leitura em Feito).
 *  Por isso este — e só este — pede confirmação; card sem peso na nota vai
 *  direto, senão a pergunta apareceria nos 200 cards da turma e viraria ruído. */
function locksAnswer(activity: ActivityView, status: ActivityStatus): boolean {
  return status === STATUS_DONE && activity.status !== STATUS_DONE && activity.weight > 0;
}

/** Posição 1-based do card na coluna em que ele está — a mesma unidade que o
 *  `sort` de `handleMove`, e o que permite devolvê-lo ao lugar exato. */
function columnIndexOf(activity: ActivityView, activities: ActivityView[]): number {
  const index = activities
    .filter((a) => a.week === activity.week && a.status === activity.status)
    .findIndex((a) => a.id === activity.id);
  return index === -1 ? activity.sort : index + 1;
}

function Workspace({
  raw: initialRaw,
  onExit,
  persistStatus,
  persistAnswer,
  initialRoute,
  fetchNews,
  user = null,
  onLogout,
}: AppProps) {
  const [raw, setRaw] = useState(initialRaw);
  // A tela sai da URL: abrir /financial já entra no Financeiro, e F5 volta para
  // onde a pessoa estava. `initialRoute` (harness de dev) tem precedência porque
  // lá o endereço é sempre `/`.
  const [route, setRouteState] = useState<RouteId>(
    () => initialRoute ?? routeForPath() ?? "overview",
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selected, setSelected] = useState<ActivityView | null>(null);
  // Movimento aplicado na tela mas ainda não enviado: espera a confirmação de
  // "Feito" numa ponderada. `activity` é o estado ANTES do movimento — é dele
  // que sai o caminho de volta se a pessoa cancelar.
  const [pendingMove, setPendingMove] = useState<{
    activity: ActivityView;
    status: ActivityStatus;
    sort: number;
    previousSort: number;
  } | null>(null);
  const [week, setWeek] = useState("all");
  const [news, setNews] = useState<NewsItem[] | null>(null);
  const [simulacao, setSimulacao] = useState<SimulacaoConfig>(DEFAULT_SIMULACAO);
  const [participacao, setParticipacao] = useState<ParticipacaoLetra>("B");
  const [multipliers, setMultipliers] = useState<ParticipacaoMultipliers>(
    DEFAULT_PARTICIPACAO_MULTIPLIERS,
  );
  const [theme, setTheme] = useState<Theme>("dark");
  // Super Tech é uma variação do escuro, não um terceiro tema: no claro ele nem
  // aparece no menu, e o estado fica guardado esperando a volta ao escuro.
  const [superTech, setSuperTech] = useState(false);
  const [newsLoading, setNewsLoading] = useState(!!fetchNews);
  // Turma cujo /userdata está sendo baixado. Só uma por vez: duas respostas
  // chegando fora de ordem deixariam a tela na turma errada.
  const [switchingSection, setSwitchingSection] = useState<string | null>(null);
  const toast = useToast();
  const client = useApiClient();

  // Notícias são acessório: se a chamada falhar, o card mostra vazio e o resto
  // do dashboard segue normal — não vale um erro na tela inteira.
  useEffect(() => {
    if (!fetchNews) return;
    let alive = true;
    void fetchNews()
      .then((payload) => alive && setNews(normalizeNews(payload)))
      .catch(() => alive && setNews([]))
      .finally(() => alive && setNewsLoading(false));
    return () => {
      alive = false;
    };
  }, [fetchNews]);

  // Preferências do aluno (tema, Super Tech, simulação) sobrevivem a recarregar a
  // página e a sair e voltar da UI nova — ficam em chrome.storage.local, que é do
  // navegador da pessoa e não expira como sessão.
  //
  // Tudo é lido numa passada só e só então `prefsLoaded` abre a escrita. Sem esse
  // portão, o efeito de salvar rodava no primeiro render com os PADRÕES e, se a
  // overlay fosse desmontada antes da leitura voltar (trocar para a UI original,
  // mudar de rota), o padrão sobrescrevia a preferência de verdade.
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    void Promise.all([getPref("theme"), getPref("superTech"), getPref("simulador")]).then(
      ([storedTheme, storedSuperTech, storedSimulador]) => {
        if (!alive) return;

        if (storedTheme === "light" || storedTheme === "dark") setTheme(storedTheme);
        setSuperTech(storedSuperTech === "on");

        if (storedSimulador) {
          try {
            const saved = JSON.parse(storedSimulador) as {
              simulacao?: SimulacaoConfig;
              participacao?: ParticipacaoLetra;
              multipliers?: ParticipacaoMultipliers;
            };
            if (saved.simulacao) setSimulacao({ ...DEFAULT_SIMULACAO, ...saved.simulacao });
            if (saved.participacao) setParticipacao(saved.participacao);
            if (saved.multipliers) {
              setMultipliers({ ...DEFAULT_PARTICIPACAO_MULTIPLIERS, ...saved.multipliers });
            }
          } catch {
            /* preferência corrompida: segue com o padrão */
          }
        }

        setPrefsLoaded(true);
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!prefsLoaded) return;
    void setPref("simulador", JSON.stringify({ simulacao, participacao, multipliers }));
  }, [prefsLoaded, simulacao, participacao, multipliers]);

  const superTechOn = theme === "dark" && superTech;

  useEffect(() => {
    if (prefsLoaded) {
      void setPref("theme", theme);
      void setPref("superTech", superTech ? "on" : "off");
    }
    // O fundo da raiz acompanha o modo mesmo antes de carregar: é ele que aparece
    // no overscroll, e um #0e0e10 atrás de uma página #08080a apareceria como
    // faixa mais clara.
    document.documentElement.style.background =
      theme === "light" ? "#f4f4f6" : superTechOn ? "#08080a" : "#0e0e10";
  }, [prefsLoaded, theme, superTech, superTechOn]);

  /** Trocar de tela é uma navegação: o endereço muda junto e entra no histórico,
   *  então voltar/avançar do navegador andam pelas telas. */
  const setRoute = useCallback((next: RouteId) => {
    setRouteState(next);
    pushRoute(next);

    // Tela nova começa do começo. Quem rola é o documento (o host entra no fluxo
    // normal, ver `createHost` em mount.tsx), e a rolagem não se mexe sozinha na
    // troca de tela: clicar num card de semana no pé da Visão geral — ou no
    // título de uma semana no Calendário, que fica ainda mais abaixo — abria o
    // kanban no meio da página.
    //
    // Só aqui, e não no `setRouteState` que o voltar/avançar usa: ali o
    // navegador restaura a rolagem de onde a pessoa saiu, que é o certo.
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  useEffect(() => onHistoryRoute(setRouteState), []);

  /** Sessão morta DE VERDADE: o token venceu e o Cognito recusou renovar. O
   *  vencimento em si não é notícia — acontece de hora em hora e a renovação
   *  resolve sozinha, sem ninguém ver (ver `ensureSession` em ~/data/client).
   *
   *  Duas fontes, porque uma só sempre chega tarde: a sondagem periódica, que
   *  também é o gatilho da renovação, e a primeira escrita que volta como erro
   *  de sessão — quando o refresh morreu antes da hora, o `exp` ainda parece
   *  bom.
   *
   *  E o estado é reversível: a faixa sai sozinha quando a sessão volta (outra
   *  aba renovou, a rede voltou). Antes ela grudava até recarregar — uma vez na
   *  tela, ficava lá mesmo com tudo funcionando de novo. */
  const [sessionDead, setSessionDead] = useState(false);

  useEffect(() => {
    const ensure = client?.ensureSession;
    if (!ensure) return;

    let alive = true;
    const check = () => {
      void ensure().then((state) => {
        // `unknown` é rede fora: não dá para afirmar nada, então fica como está.
        if (alive && state !== "unknown") setSessionDead(state === "expired");
      });
    };
    check();

    // Voltar para a aba é justamente quando o token passou da validade, e
    // esperar o próximo tick deixaria a pessoa clicar antes da renovação.
    const id = setInterval(check, 30_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", check);
    };
  }, [client]);

  /** Troca a turma carregada — inclusive para uma já encerrada, que é como se
   *  consultam as notas e as faltas dos módulos passados.
   *
   *  O `raw` inteiro é substituído, então tudo que deriva dele (notas, kanban,
   *  faltas, simulador) passa a falar da turma escolhida. O que estava aberto em
   *  cima da turma anterior sai junto: o cartão selecionado não existe na nova, e
   *  a semana filtrada tem outro significado lá.
   *
   *  A troca NÃO toca no `@buzz:currentSection` do Adalove: a turma da UI deles
   *  continua a que era, e um F5 volta para ela. Consultar módulo passado é
   *  visita, não mudança de endereço. */
  const selectSection = useCallback(
    (uuid: string) => {
      if (!client || switchingSection || uuid === raw.section?.sectionUuid) return;

      setSwitchingSection(uuid);
      client
        .get<RawUserdata>(`/sections/${uuid}/userdata`)
        .then((next) => {
          setRaw(next);
          setSelected(null);
          setWeek("all");
        })
        .catch((error: unknown) => {
          toast.error(
            error instanceof Error
              ? `Não consegui abrir a turma: ${error.message}`
              : "Não consegui abrir a turma.",
          );
        })
        .finally(() => setSwitchingSection(null));
    },
    [client, switchingSection, raw.section?.sectionUuid, toast],
  );

  const openWeek = useCallback(
    (value: string) => {
      setWeek(value);
      setRoute("atividades");
    },
    [setRoute],
  );

  // Mesma conta do site: a meta é dividida pelo multiplicador de participação
  // antes do cálculo, para "objetivo 7 com participação A" exigir menos.
  const effectiveMetaFinal =
    multipliers[participacao] > 0
      ? simulacao.metaFinal / multipliers[participacao]
      : simulacao.metaFinal;

  const view = useMemo(
    () => buildSectionView(raw, { ...simulacao, metaFinal: effectiveMetaFinal }),
    [raw, simulacao, effectiveMetaFinal],
  );

  /** Aplica a mudança E renumera a coluna de destino. O Adalove só envia o
   *  `sort` do card movido e re-sequencia no backend; sem renumerar aqui, dois
   *  cards ficariam com o mesmo `sort` e a ordem local sairia ambígua. */
  const setActivityStatus = useCallback((id: string, status: ActivityStatus, sort: number) => {
    setRaw((current) => {
      const moved = current.activities.find((a) => a.studentActivityUuid === id);
      if (!moved) return current;

      const sameColumn = current.activities
        .filter(
          (a) =>
            a.studentActivityUuid !== id &&
            a.status === status &&
            a.folderCaption === moved.folderCaption,
        )
        .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

      // Reinsere o card na posição pedida e numera de 1 a n.
      const ordered = [...sameColumn];
      ordered.splice(Math.max(0, Math.min(sort - 1, ordered.length)), 0, moved);
      const sorts = new Map(ordered.map((a, i) => [a.studentActivityUuid, i + 1]));

      return {
        ...current,
        activities: current.activities.map((a) => {
          const nextSort = sorts.get(a.studentActivityUuid);
          if (a.studentActivityUuid === id) return { ...a, status, sort: nextSort ?? sort };
          return nextSort == null ? a : { ...a, sort: nextSort };
        }),
      };
    });
  }, []);

  /** Resolve `true` só quando o Adalove aceitou o movimento — é o que permite a
   *  quem chamou avisar a pessoa sem prometer o que o PUT ainda pode recusar. */
  const commitMove = useCallback(
    (
      activity: ActivityView,
      status: ActivityStatus,
      sort: number,
      previousSort: number,
    ): Promise<boolean> => {
      if (!persistStatus) return Promise.resolve(false);

      const previousStatus = activity.status;

      // Optimistic: a coluna muda na hora. Se o PUT falhar, o card volta —
      // nunca fica um estado local que o Adalove não conhece.
      setActivityStatus(activity.id, status, sort);

      return persistStatus(activity.id, status, sort)
        .then(() => true)
        .catch((error: unknown) => {
          setActivityStatus(activity.id, previousStatus, previousSort);

          // Sessão vencida não é "não foi possível mover": o movimento estava
          // certo, a sessão é que não estava. A frase do erro já diz o que
          // fazer, e a faixa fica na tela depois que o toast sai.
          if (error instanceof AdaloveAuthError) {
            setSessionDead(true);
            toast.error(error.message);
            return false;
          }

          toast.error(
            error instanceof Error
              ? `Não foi possível mover: ${error.message}`
              : "Não foi possível mover a atividade.",
          );
          return false;
        });
    },
    [persistStatus, setActivityStatus, toast],
  );

  const handleMove = useCallback(
    (activity: ActivityView, status: ActivityStatus, sort: number) => {
      if (!persistStatus) return;

      const previousSort = columnIndexOf(activity, view.activities);

      // O card já vai para Feito — é o que a pessoa acabou de fazer, e travá-lo
      // no lugar antigo faria o arraste parecer ter falhado. O que espera o
      // Confirmar é o PUT; no Cancelar o card volta para a coluna de origem.
      if (locksAnswer(activity, status)) {
        setActivityStatus(activity.id, status, sort);
        setPendingMove({ activity, status, sort, previousSort });
        return;
      }

      void commitMove(activity, status, sort, previousSort);
    },
    [commitMove, persistStatus, setActivityStatus, view.activities],
  );

  const confirmPendingMove = useCallback(() => {
    if (!pendingMove) return;
    const { activity, status, sort, previousSort } = pendingMove;
    setPendingMove(null);

    // O aviso sai depois do PUT, não do clique: a coluna muda de forma otimista,
    // e prometer "movida" antes da resposta poderia ser desmentido pelo toast de
    // erro um instante depois.
    void commitMove(activity, status, sort, previousSort).then((ok) => {
      if (ok) toast.success("Movida para Feito. A resposta não pode mais ser alterada.");
    });
  }, [commitMove, pendingMove, toast]);

  const cancelPendingMove = useCallback(() => {
    if (!pendingMove) return;
    const { activity, previousSort } = pendingMove;
    setPendingMove(null);
    setActivityStatus(activity.id, activity.status, previousSort);
  }, [pendingMove, setActivityStatus]);

  /** Ao contrário do kanban, a resposta NÃO é otimista: o texto já está na tela
   *  (é o que a pessoa acabou de digitar), então antecipar não ganha nada, e
   *  gravar antes da confirmação faria o editor exibir "Salvo" para um texto que
   *  o Adalove pode ter recusado. Só depois do PUT o `raw` acompanha — assim
   *  reabrir o cartão mostra o que está lá de verdade. */
  const handleAnswer = useCallback(
    async (activity: ActivityView, html: string) => {
      if (!persistAnswer) return;
      try {
        await persistAnswer(activity.id, html);
      } catch (error) {
        // O editor já mostra "Não salvo" e o toast do erro; o que falta é a
        // faixa, para o aviso não sumir junto com o toast.
        if (error instanceof AdaloveAuthError) setSessionDead(true);
        throw error;
      }
      setRaw((current) => ({
        ...current,
        activities: current.activities.map((a) =>
          a.studentActivityUuid === activity.id ? { ...a, studyAnswer: html } : a,
        ),
      }));
    },
    [persistAnswer],
  );

  return (
    <div
      data-theme={theme}
      data-super-tech={superTechOn ? "on" : undefined}
      className="adalove-ui-root flex min-h-screen w-full bg-bg text-fg"
    >
      <Sidebar
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
        route={route}
        onRoute={setRoute}
        user={user ?? { name: view.studentName, email: null, uuid: null, avatar: null }}
        sectionCaption={view.section.caption}
        onExit={onExit}
        onLogout={onLogout}
      />

      <main className="flex min-w-0 flex-1 flex-col px-4 py-6 lg:px-6">
        {/* Teto de largura: em monitor grande o conteúdo esticava de ponta a
            ponta e as linhas ficavam longas demais para ler. */}
        {/* `flex-1` empurra o rodapé para baixo: em tela curta ele encostava
            no conteúdo, no meio da página. */}
        <div className="mx-auto w-full max-w-[1400px] flex-1">
        {sessionDead && <SessionBanner onReload={() => location.reload()} />}
        {route === "overview" && (
          <Overview
            view={view}
            onOpenWeek={openWeek}
            onOpenActivity={openActivity}
            onSeeStudents={() => setRoute("grupo")}
            onProvaFinal={() => setRoute("prova-final")}
            theme={theme}
            onTheme={setTheme}
            superTech={superTech}
            onSuperTech={setSuperTech}
            simulacao={simulacao}
            onSimulacao={setSimulacao}
            participacao={participacao}
            onParticipacao={setParticipacao}
            multipliers={multipliers}
            onMultipliers={setMultipliers}
            news={news}
            newsLoading={newsLoading}
            onSelectSection={selectSection}
            switchingSection={switchingSection}
          />
        )}
        {route === "atividades" && (
          <Atividades
            view={view}
            onOpen={setSelected}
            // O Adalove pode travar o kanban por turma; respeitamos a regra deles.
            onMove={persistStatus && view.section.allowCardMovement ? handleMove : undefined}
            week={week}
            onWeekChange={setWeek}
            onBack={() => setRoute("overview")}
          />
        )}
        {route === "grupo" && <Grupo view={view} onBack={() => setRoute("overview")} />}
        {route === "prova-final" && (
          <ProvaFinal view={view} onBack={() => setRoute("overview")} />
        )}
        {route === "perfil" && (
          <Perfil view={view} user={user} onBack={() => setRoute("overview")} />
        )}
        {route === "noticias" && <Noticias onBack={() => setRoute("overview")} />}
        {route === "financeiro" && <Financeiro onBack={() => setRoute("overview")} />}
        {route === "cardapio" && <Cardapio onBack={() => setRoute("overview")} />}
        {route === "atendimento" && <Atendimento onBack={() => setRoute("overview")} />}
        {route === "historico" && <Historico onBack={() => setRoute("overview")} />}
        {route === "carreiras" && <Carreiras onBack={() => setRoute("overview")} />}
        {route === "intercambio" && <Intercambio onBack={() => setRoute("overview")} />}
        {route === "simulados" && <Simulados onBack={() => setRoute("overview")} />}
        {route === "nao-encontrada" && <NaoEncontrada onRoute={setRoute} />}
        {route.startsWith("pagina:") && (
          <Pagina
            key={route}
            slug={route.slice("pagina:".length) as PageSlug}
            onBack={() => setRoute("overview")}
          />
        )}
        </div>

        <div className="mx-auto w-full max-w-[1400px]">
          <Footer />
        </div>
      </main>

      <ActivityModal
        activity={selected}
        view={view}
        onClose={() => setSelected(null)}
        onMove={persistStatus ? handleMove : undefined}
        onAnswer={persistAnswer ? handleAnswer : undefined}
      />

      <ConfirmDialog
        open={!!pendingMove}
        title="Atenção"
        message={
          <>
            <strong className="font-medium text-fg">
              Confirma mover o card para FEITO?
            </strong>{" "}
            Ao mover o card de uma atividade ponderada para FEITO, você não poderá mais alterar a
            sua resposta.
          </>
        }
        onConfirm={confirmPendingMove}
        onCancel={cancelPendingMove}
      />
    </div>
  );
}

export default function App(props: AppProps) {
  return (
    <ApiProvider value={props.api}>
      <ToastProvider>
        <Workspace {...props} />
      </ToastProvider>
    </ApiProvider>
  );
}
