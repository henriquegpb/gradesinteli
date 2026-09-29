import { ext } from "~/lib/ext";

// A "Ficha do aluno" é um Apps Script da Inteli (não é do Adalove): métricas do
// módulo corrente comparadas à turma. Quem busca é o `extension/background.js`,
// com o login Google do aluno; aqui só chegam os dados já extraídos do
// `window.FICHA_INLINE` que o script embute na página.
//
// Os tipos abaixo espelham o payload como ele veio em 29/09/2026. Tudo que pode
// não existir ainda no módulo (prova sem nota, faixa não fechada) é `null`.

export interface FichaFaixa {
  /** Pessimista: o que já está garantido, zerando o que falta. */
  n_min: number;
  n_atual: number;
  /** Otimista: tirando 10 em tudo o que falta. */
  n_max: number;
  peso_avaliado?: number;
  peso_total?: number;
}

export interface FichaAutoestudo {
  eixo: string;
  eixo_nome: string;
  media: number | null;
  media_turma: number | null;
  qtd_atividades: number;
}

export interface FichaProjeto {
  semana: number;
  sprint: number;
  atividade: string;
  peso: number;
  nota_grupo: number | null;
  fator_performance: number | null;
  nota_final: number | null;
  alunos_avaliados_turma: number;
  nota_grupo_turma: number | null;
  fator_turma: number | null;
  nota_final_turma: number | null;
  nota_final_min_turma: number | null;
  nota_final_max_turma: number | null;
}

export interface FichaHistorico {
  trimestre: string | null;
  modulo: string;
  turma: string | null;
  nota: number | null;
  presenca_pct: number | null;
  status: string | null;
  corrente: boolean | null;
}

export type Faixa = "A" | "B" | "C" | "D" | "E";

export interface FichaDistribuicao {
  faixa: Faixa;
  alunos_turma: number;
  pct_turma: number;
  alunos_inteli: number;
  pct_inteli: number;
  pct_norma: number;
}

export type FaltasRisco = "ok" | "atencao" | "alerta" | "critico" | "estourado";

export interface Ficha {
  meta: {
    section_id: number;
    turma: string;
    trimestre: string;
    modulo: string;
    periodo: string;
    semana_corte: number;
    total_alunos: number;
    sprint_corrente: number;
    sprint_fecha_em: string;
  };
  aluno: {
    grupo: string | null;
    faixa: FichaFaixa;
    percentil: number | null;
    quartis: Record<"prova" | "projeto" | "autoestudo", { nota: number | null; quartil: number | null }>;
    autoestudo: FichaAutoestudo[];
    projeto: FichaProjeto[];
    provas: { prova_id: string; nota: number | null; contribuicao_20pct: number | null }[];
    faixa_participacao: { faixa: Faixa | null; fator: number | null; atualizado_em: string | null };
    participacao: {
      ciclo_fechado: boolean;
      fechamento_previsto: string | null;
      faixa_provavel: Faixa | null;
      faixa_provavel_melhor: Faixa | null;
      faixa_provavel_pior: Faixa | null;
      margem_pp: number | null;
    };
    engajamento: {
      presenca_pct: number | null;
      faltas_pct: number | null;
      presenca_origem?: { fonte: string; data: string };
      faltas_folga_pp: number | null;
      faltas_risco: FaltasRisco | null;
      pct_a_fazer: number;
      pct_fazendo: number;
      pct_feito: number;
      atividades_vencidas: number;
    };
    sprint_corrente: {
      sprint: number;
      semanas: number[];
      fecha_em: string;
      total_atividades: number;
      vencidas: number;
      a_fazer: number;
      fazendo: number;
      feito: number;
    } | null;
    historico: FichaHistorico[];
    cra: number | null;
    historico_origem?: { fonte: string; data: string };
    /** Nota pessimista acumulada por semana (chave = número da semana). */
    serie: Record<string, number>;
  };
  turma: {
    participacao_distribuicao: FichaDistribuicao[];
    faixa_top25: FichaFaixa;
    engajamento: {
      presenca: number;
      pct_a_fazer: number;
      pct_fazendo: number;
      pct_feito: number;
    };
    serie: Record<string, { media: number; top25: number }>;
    autoestudo: Record<string, number>;
  };
  provas: { prova_id: string; ordem: number; nome: string; peso: number; semana: number }[];
}

/** `permission`: o aluno ainda não autorizou script.google.com (é permissão
 *  opcional, pedida no clique — ver `authorizeFicha`). */
export type FichaErro = "permission" | "login" | "network" | "http" | "format" | "unavailable";

export class FichaError extends Error {
  constructor(
    readonly reason: FichaErro,
    readonly url?: string,
  ) {
    super(reason);
  }
}

/** Onde o aluno abre a ficha original — também é o remédio do erro de login. */
export const FICHA_URL =
  "https://script.google.com/a/macros/sou.inteli.edu.br/s/AKfycbzPPAq9NHqyqsl_MqaA1m1RkZ4H1uuFH58JsDLpoYqL6EGhHRPQFsqbT5fJhbM9pE1L/exec";

type WorkerReply =
  | { ok: true; data: Ficha }
  | { ok: false; reason: Exclude<FichaErro, "unavailable"> };

/** A ficha só atualiza de manhã: uma busca por carregamento da página basta, e
 *  voltar para a tela não refaz a viagem até o Google. */
let cached: Promise<Ficha> | null = null;

export function fetchFicha(): Promise<Ficha> {
  cached ??= (async () => {
    if (!ext?.runtime?.sendMessage) throw new FichaError("unavailable");
    const reply = (await ext.runtime.sendMessage({ type: "gi:ficha" })) as WorkerReply | undefined;
    if (!reply) throw new FichaError("network");
    if (!reply.ok) throw new FichaError(reply.reason, FICHA_URL);
    return reply.data;
  })().catch((error: unknown) => {
    cached = null; // erro não fica em cache: o próximo clique tenta de novo
    throw error;
  });
  return cached;
}

const GRANTED_KEY = "fichaAccessGrantedAt";

/** Abre a janelinha da extensão que pede a permissão e resolve quando o aluno
 *  concede. Não rejeita se ele fechar sem aceitar: a tela continua mostrando o
 *  botão, e clicar de novo reabre a mesma janela. */
export function authorizeFicha(): Promise<void> {
  const storage = ext?.storage;
  if (!ext?.runtime?.sendMessage || !storage) return Promise.reject(new FichaError("unavailable"));

  return new Promise<void>((resolve) => {
    const onChanged = (changes: Record<string, unknown>, area: string) => {
      if (area !== "local" || !(GRANTED_KEY in changes)) return;
      storage.onChanged.removeListener(onChanged);
      cached = null;
      resolve();
    };
    storage.onChanged.addListener(onChanged);
    void ext!.runtime.sendMessage({ type: "gi:ficha-authorize" });
  });
}
