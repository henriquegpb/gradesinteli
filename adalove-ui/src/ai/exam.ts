import { truncate } from "~/ai/prompt";
import { buildSubjects, type Sprint } from "~/ai/summary";
import type { ActivityView, SectionView } from "~/data/viewmodel";
import { formatDate } from "~/lib/date";

// Estudar para a prova final: o que dá para MEDIR sobre o peso de cada matéria.
//
// O Adalove não publica o conteúdo da prova. O que ele tem é quantos encontros
// cada professor deu — e, como "matéria" aqui é o agrupamento por professor de
// `~/ai/summary` (o /userdata não tem esse campo), a contagem de aulas é o
// melhor proxy disponível para quanto cada assunto pesa na avaliação. Toda a
// tela é honesta sobre isso: é estimativa, não gabarito.

/** Tipos de atividade que são encontro — aula de verdade, com chamada. O resto
 *  (autoestudo, videoaula, material) conta como material de revisão. */
const ENCONTRO_KINDS = new Set([1, 2]);

export function isAula(a: ActivityView): boolean {
  return ENCONTRO_KINDS.has(a.kind.id);
}

export interface ExamSubject {
  id: string;
  label: string;
  professor: string | null;
  axis: string | null;
  /** Encontros da matéria: o "quanto de módulo" dela. */
  aulas: ActivityView[];
  /** Autoestudos, videoaulas e materiais — o que dá para reler antes da prova. */
  materiais: ActivityView[];
}

/** Matérias do módulo ordenadas por volume de aula, que é a ordem em que faz
 *  sentido estudar. Matéria sem nenhum encontro fica de fora: sem aula não há o
 *  que distribuir, e ela entraria no gráfico como uma fatia de tamanho zero. */
export function buildExamSubjects(view: SectionView): ExamSubject[] {
  return buildSubjects(view)
    .map((s) => ({
      id: s.id,
      label: s.label,
      professor: s.professor,
      axis: s.axis,
      aulas: s.activities.filter(isAula),
      materiais: s.activities.filter((a) => !isAula(a)),
    }))
    .filter((s) => s.aulas.length > 0)
    .sort((a, b) => b.aulas.length - a.aulas.length || a.label.localeCompare(b.label));
}

/** A prova do módulo: a de maior peso entre as atividades marcadas como prova.
 *  `null` quando o módulo ainda não tem uma no kanban. */
export function findExam(view: SectionView): ActivityView | null {
  return (
    view.activities
      .filter((a) => a.isExam || a.category === "Prova")
      .sort((a, b) => b.weight - a.weight)[0] ?? null
  );
}

/** Quantos dias faltam para a data (negativo se já passou). As datas do
 *  /userdata são meia-noite UTC e o "hoje" é local: os dois viram data pura
 *  antes da subtração, senão o fuso comeria ou inventaria um dia. */
export function daysUntil(iso: string | null, now = new Date()): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const target = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86_400_000);
}

/** A prova como o aluno declara: quantas questões de cada tipo e quanto cada
 *  uma vale. O valor não é enfeite — é ele que diz onde estão os pontos, e duas
 *  discursivas de 2,0 pesam mais que vinte múltiplas de 0,3. */
export interface ExamFormat {
  discursivas: number;
  multipla: number;
  valorDiscursiva: number;
  valorMultipla: number;
}

/** Pontos de cada parte e o total — a conta que a tela mostra e o prompt repete. */
export function examPoints(format: ExamFormat): {
  discursivas: number;
  multipla: number;
  total: number;
} {
  const discursivas = format.discursivas * format.valorDiscursiva;
  const multipla = format.multipla * format.valorMultipla;
  return { discursivas, multipla, total: discursivas + multipla };
}

/** Uma casa decimal, ponto como separador: a mesma leitura de nota do resto da
 *  UI (`fmtNota`), para 0.3 e 2.0 não aparecerem aqui em outro formato. */
export function fmtPontos(value: number): string {
  return value.toFixed(1);
}

/** "1 aula" / "3 aulas". Vive aqui porque o prompt e a tela contam as mesmas
 *  coisas, e duas listas de plurais divergiriam na primeira troca de palavra. */
export function plural(n: number, singular: string, plural_: string): string {
  return `${n} ${n === 1 ? singular : plural_}`;
}

/** Reparte `total` questões entre os pesos, pelo método do maior resto: o chão
 *  de cada parte primeiro e as sobras para quem tem a maior fração pendente.
 *  Distribuir só por arredondamento devolveria mais ou menos questões do que a
 *  prova tem — e é justamente o total que o aluno digitou. */
export function distribute(total: number, weights: number[]): number[] {
  const sum = weights.reduce((acc, w) => acc + w, 0);
  if (total <= 0 || sum <= 0) return weights.map(() => 0);

  const exact = weights.map((w) => (w / sum) * total);
  const parts = exact.map(Math.floor);
  let rest = total - parts.reduce((acc, n) => acc + n, 0);

  const order = exact
    .map((value, i) => ({ i, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac);

  for (const { i } of order) {
    if (rest <= 0) break;
    parts[i] = (parts[i] ?? 0) + 1;
    rest -= 1;
  }
  return parts;
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

/** Títulos por matéria. O corte é por matéria e não global para a última da
 *  lista não ficar sem conteúdo nenhum — é justamente ela que o aluno menos
 *  lembra. */
const MAX_AULAS = 14;
const MAX_MATERIAIS = 8;
const MAX_EXAM_DESCRIPTION = 500;

function RESPONSE_RULES(kind: "plano" | "simulado", tipo: ExamType = "final"): string {
  const demo = tipo === "demo";
  return [
    "## Como responder",
    "- Português do Brasil.",
    kind === "simulado"
      ? demo
        ? "- Escreva cada pergunta como ela seria feita na hora, em voz alta, e não como tópico genérico de checklist."
        : tipo === "desafio"
          ? "- Escreva cada questão inteira, com enunciado e alternativas, como ela apareceria na folha. Não descreva o que a questão seria."
          : "- Escreva cada questão inteira como ela cairia na prova (enunciado, afirmativas numeradas quando houver, e as cinco alternativas). Não descreva o que a questão seria."
      : "- Seja concreto: um plano que eu consiga seguir hoje vale mais que teoria sobre como estudar.",
    demo
      ? "- Não invente entrega que a sprint não teve: os artefatos acima são o que existe para mostrar."
      : "- Não invente conteúdo que o módulo não teve: os títulos acima são o recorte do que pode cair.",
    "- Onde o material não disser o suficiente, diga o que falta em vez de preencher com genérico.",
  ].join("\n");
}

/** Como a prova do Inteli é POR DENTRO.
 *
 *  Levantado de provas regulares reais (22 questões, Turma 11, CC05 e CC06): o
 *  que se repete não é o assunto, é a forma de perguntar. Sem isto a IA devolve
 *  perguntas soltas de definição — que é o que menos cai — e o simulado não
 *  treina o gesto que a prova cobra, que é julgar afirmação por afirmação.
 *
 *  Vale para qualquer módulo, então é texto fixo: o que muda de um para o outro
 *  é o conteúdo, e esse vem das matérias. */
const EXAM_STYLE = [
  "## Como as provas do Inteli são por dentro",
  "Levantado de provas anteriores, vale mais que o meu palpite sobre o que cai:",
  "- É no papel: prova impressa, respondida à mão, sem consulta e sem computador. O que não estiver na minha cabeça na hora não entra.",
  "- Múltipla escolha SEMPRE com cinco alternativas (a–e).",
  "- A maior parte é julgamento de afirmativas: o enunciado lista de três a sete afirmações numeradas (I, II, III…) e as alternativas são combinações delas: \"Apenas I e III\", \"Somente II e IV\", \"Todas as afirmativas estão corretas\". Parte dessas inverte a pergunta e pede as FALSAS.",
  "- Aparecem também três formas fixas: asserção-razão no estilo ENADE (duas proposições ligadas por PORQUE, e a alternativa diz se cada uma é verdadeira e se a segunda justifica a primeira); classificação de afirmações como FATO ou OPINIÃO, com a alternativa sendo a sequência (por exemplo \"O, F, O, F, F\"); e caso longo de empresa fictícia terminando em \"qual alternativa melhor representa…\".",
  "- Boa parte das questões traz um artefato impresso para ler antes de julgar: trecho de código, árvore, matriz de adjacência, tableau do Simplex, modelo de programação linear, relatório de sensibilidade.",
  "- As discursivas pedem a resolução passo a passo, escrita à caneta na folha. Costumam cair no conteúdo que tem o que calcular ou modelar, não no conceitual.",
  "",
  "Duas consequências para o plano de estudo, e quero elas levadas a sério: treinar escrevendo à mão (inclusive as contas), e decorar de fato os critérios que as afirmativas costumam torcer. Não ter onde consultar muda o que significa \"saber\" cada tópico.",
].join("\n");

/** Como a avaliação funciona, escrito PELO ALUNO.
 *
 *  A prova final tem provas fotografadas para sustentar o que o prompt afirma
 *  (ver EXAM_STYLE). A demo e o desafio não têm nada disso: o Adalove não diz
 *  quem assiste, quanto tempo dura, se tem pergunta no fim. Descrever isso de
 *  cabeça seria inventar — e inventado no prompt vira resposta inventada. Então
 *  ou vem do aluno, ou o prompt manda a IA perguntar em vez de supor. */
function howItWorksBlock(tipo: "demo" | "desafio", texto: string | undefined): string {
  const nome = tipo === "demo" ? "a demo" : "o desafio";
  if (texto?.trim()) {
    return [
      `## Como ${nome} funciona (escrito por mim)`,
      "Isto vem de mim, não do Adalove, e é a descrição que vale:",
      truncate(texto, MAX_NOTES_CHARS),
    ].join("\n");
  }
  return [
    `## Como ${nome} funciona`,
    `Eu não descrevi o formato. NÃO presuma como ${nome} funciona no meu curso: trabalhe com o que está listado abaixo e, quando o formato mudar a sua resposta, diga o que você precisa saber em vez de chutar.`,
  ].join("\n");
}

function titles(activities: ActivityView[], max: number, label: string): string {
  if (activities.length === 0) return "";
  const shown = activities.slice(0, max);
  const rest = activities.length - shown.length;
  return [
    `${label}:`,
    ...shown.map((a) => `  - ${a.caption}`),
    rest > 0 ? `  … e mais ${rest}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function examLine(exam: ActivityView | null): string {
  if (!exam) return "";

  const when = formatDate(exam.date);
  const days = daysUntil(exam.date);
  const quando = when
    ? `, ${when}${days !== null && days >= 0 ? ` (em ${plural(days, "dia", "dias")})` : ""}`
    : "";
  const peso =
    exam.weight > 0 ? `, vale ${plural(exam.weight, "ponto", "pontos")} na média do módulo` : "";
  return `Prova: ${exam.caption}${quando}${peso}`;
}

/** "4 de múltipla escolha e 1 discursiva" — sem parêntese de plural, que é o que
 *  faz um prompt parecer gerado por formulário. A múltipla escolha vem primeiro,
 *  na mesma ordem em que a tela pergunta. */
function questionCount(multipla: number, discursivas: number): string {
  const partes = [
    multipla > 0 ? `${multipla} de múltipla escolha` : null,
    discursivas > 0 ? plural(discursivas, "discursiva", "discursivas") : null,
  ].filter(Boolean);
  return partes.length > 0 ? partes.join(" e ") : "nenhuma questão nesta divisão";
}

/** O que o aluno decidiu por cima dos dados: o recorte de conteúdo e o que só
 *  ele sabe da prova. */
/** As três avaliações do módulo, como o Inteli as chama.
 *
 *  Não são variações da mesma coisa: a prova final cobra o módulo inteiro por
 *  escrito, o desafio cobra UMA matéria, e a demo não é prova nenhuma — é a
 *  apresentação do que a sprint entregou (nos dados, cada sprint fecha com um
 *  artefato "Apresentação de…"). Por isso cada uma tem seu recorte de conteúdo
 *  e seus próprios pedidos para a IA. */
export type ExamType = "demo" | "desafio" | "final";

export interface ExamScope {
  /** Qual avaliação. Padrão: a prova final. */
  tipo?: ExamType;
  /** A sprint da demo. Só faz sentido em `tipo: "demo"`. */
  sprint?: Sprint;
  /** Matérias que ele TIROU da prova. Entram no prompt como proibição
   *  explícita: sem dizer, a IA puxa o módulo inteiro de volta. */
  excluded?: string[];
  /** Observações livres. É a única parte do prompt que a tela não tem como
   *  deduzir, então vai perto do topo, onde pesa. */
  notes?: string;
  /** Como a demo ou o desafio funcionam, nas palavras do aluno. Sem isto o
   *  prompt proíbe a IA de presumir o formato. */
  howItWorks?: string;
  /** O projeto do grupo, nas palavras do aluno. É o assunto da demo, e nada
   *  disso está no /userdata além de uma linha de descrição do módulo. */
  project?: string;
  /** O aluno tem o Google Drive conectado na IA, então ela mesma vai buscar os
   *  slides na pasta da turma. Muda o estatuto da lista de títulos: com os
   *  slides ela é índice, sem eles ela é a única fonte. */
  driveSearch?: boolean;
}

/** O que dizer sobre o material das aulas.
 *
 *  O conteúdo de verdade mora no Drive da turma (slides, PDFs, notebooks), e
 *  nada disso passa por aqui: a extensão lê o /userdata, não o Drive, e mesmo
 *  que lesse, dezenas de PPTX não cabem num prompt. Com o Drive conectado na
 *  IA, porém, quem vai buscar é ela.
 *
 *  A busca merece cuidado: os conectores procuram por NOME e conteúdo, não
 *  abrem uma pasta pela URL e percorrem. Por isso o bloco entrega os termos de
 *  busca (as siglas das matérias, e os títulos das aulas estão logo abaixo no
 *  prompt) — e cobra uma admissão explícita quando a busca não achar nada, que
 *  é o jeito de a resposta não virar um slide inventado. */
function materialBlock(
  driveSearch: boolean | undefined,
  view: SectionView,
  /** O que procurar por nome: siglas das matérias, ou os artefatos da sprint. */
  termos: string,
  /** Ressalva do recorte, quando a ligação entre material e avaliação não é
   *  conhecida. É o caso da demo. */
  caveat?: string,
): string {
  if (driveSearch) {
    const drive = view.section.repository;
    return [
      "## Material das aulas (busque no meu Google Drive)",
      `Tenho o Google Drive conectado nesta conversa. Os slides e materiais das aulas estão na pasta da turma ${view.section.caption}${
        drive ? `, que é esta: ${drive}` : ""
      }. Ela é compartilhada comigo, então pode aparecer como "compartilhado comigo".`,
      `- Antes de responder, procure lá os arquivos listados abaixo. Busque ${termos}. A busca é por nome e conteúdo, não adianta só abrir o link da pasta.`,
      "- O que você encontrar é a fonte principal; a lista de títulos abaixo é só o índice.",
      // A regra que impede o pior desfecho: dizer que leu o slide sem ter lido.
      "- Se a busca não trouxer nada (conector desligado, sem acesso à pasta, formato que você não lê), diga isso na PRIMEIRA linha da resposta e siga apenas com os títulos. Nunca descreva o conteúdo de um arquivo que você não abriu de fato.",
      "- No fim, liste o que ficou sem material encontrado e quais arquivos você usou.",
      caveat ? `- ${caveat}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    "## Material das aulas (só os títulos)",
    "Você tem os títulos das aulas, não o conteúdo delas: os slides ficam no Drive da turma, que você não acessa.",
    "- Onde o título não bastar para dizer o que foi ensinado, diga isso em vez de supor.",
    "- No fim, liste em ordem de prioridade os materiais que fariam mais diferença eu ter em mãos.",
    caveat ? `- ${caveat}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Observação é texto de gente: entra inteira, só aparada. O teto da tela (600)
 *  já é menor que isto — a folga aqui é contra um `notes` vindo de outro lugar. */
const MAX_NOTES_CHARS = 800;
/** O projeto do grupo cabe mais: é contexto, não recado. */
const MAX_PROJECT_CHARS = 1200;

/** Os dois pedidos que a mesma tela sabe montar.
 *
 *  Separados porque são dois momentos: o plano é para as semanas antes, o
 *  simulado é para o treino em si. Juntos, a IA entregava um plano espremido
 *  antes de uma prova gigante — e o aluno lia metade. O contexto (matérias,
 *  conteúdo, formato, material) é o mesmo nos dois; o que muda é o pedido. */
export type ExamPromptKind = "plano" | "simulado";

/** O enunciado do artefato vai INTEIRO na demo.
 *
 *  Ele não é contexto: é o conteúdo da apresentação. No /userdata vêm os itens
 *  a entregar com o peso de cada um ("(1) Segurança e red-teaming. (Peso =
 *  3,0)…"), que é a rubrica pela qual a entrega vai ser avaliada. Truncar isso
 *  em 700 caracteres cortava justamente os critérios — os três artefatos de uma
 *  sprint somam cerca de 9 mil, e o prompt vai pelo clipboard de qualquer jeito.
 *  O teto aqui é só contra um enunciado patológico. */
const MAX_ARTIFACT_CHARS = 6000;
const MAX_SPRINT_SUPPORT = 20;

/** O Adalove não liga aula a artefato: as atividades vêm por semana, e nada diz
 *  quais delas sustentam a entrega. Afirmar "estas são as aulas da sprint" seria
 *  inventar um vínculo que não existe, então o prompt diz o que de fato se sabe
 *  e manda tratar o resto como pista. */
const SPRINT_CAVEAT =
  "Não dá para saber quais aulas estão envolvidas em cada artefato: o Adalove agrupa atividade por semana e não liga aula a entrega. O que aparece aqui é o que caiu nas semanas da sprint, e pode ou não ter relação com o que precisa ser apresentado. Trate como pista, não como o conteúdo da entrega.";

/** O prompt da demo. Não fala de questões nem de matérias: fala dos artefatos
 *  que a sprint entregou, porque é isso que sobe na apresentação. */
function buildDemoPrompt(
  view: SectionView,
  sprint: Sprint,
  scope: ExamScope,
  kind: ExamPromptKind,
): string {
  const artefatos = sprint.artifacts.length
    ? sprint.artifacts
        .map((a) => {
          const peso = a.weight > 0 ? `, vale ${plural(a.weight, "ponto", "pontos")}` : "";
          const enunciado = a.descriptionText
            ? `\n${truncate(a.descriptionText, MAX_ARTIFACT_CHARS)}`
            : "\n(sem enunciado no Adalove)";
          return `### ${a.caption}${peso}${enunciado}`;
        })
        .join("\n\n")
    : "Esta sprint não tem artefato próprio no Adalove: ela alimenta a entrega da seguinte.";

  const apoio = sprint.activities.filter((a) => a.category !== "Artefato");

  const blocks = [
    kind === "simulado"
      ? `Sou estudante do Inteli e vou apresentar a demo da ${sprint.label} do meu módulo. Quero treinar as perguntas que ela pode gerar.`
      : `Sou estudante do Inteli e vou apresentar a demo da ${sprint.label} do meu módulo. Quero um roteiro do que mostrar e em que ordem.`,

    [
      "## Contexto",
      `Curso: ${view.section.type ?? "Graduação"} no Inteli${
        view.section.academicYear ? `, ${view.section.academicYear}º ano` : ""
      }`,
      `Turma: ${view.section.caption}`,
      view.section.projectDescription
        ? `Projeto do módulo: ${view.section.projectDescription}`
        : "",
      `Sprint: ${sprint.label} (${sprint.weeksLabel})`,
    ]
      .filter(Boolean)
      .join("\n"),

    howItWorksBlock("demo", scope.howItWorks),

    scope.project?.trim()
      ? [
          "## O projeto do grupo (escrito por mim)",
          truncate(scope.project, MAX_PROJECT_CHARS),
        ].join("\n")
      : "",

    materialBlock(
      scope.driveSearch,
      view,
      `pelos títulos das atividades listadas abaixo e pelo nome dos artefatos da ${sprint.label}`,
      SPRINT_CAVEAT,
    ),

    [
      `## Os artefatos da ${sprint.label}: conteúdo e critérios de avaliação`,
      "É isto que a demo apresenta. O que vem abaixo é o enunciado completo de cada artefato, com os itens a entregar e o peso de cada um na nota. Use os critérios como a régua da apresentação.",
      "",
      artefatos,
    ].join("\n"),

    apoio.length
      ? [
          `## Atividades das semanas da ${sprint.label} (${apoio.length})`,
          SPRINT_CAVEAT,
          titles(apoio, MAX_SPRINT_SUPPORT, "Conteúdo"),
        ].join("\n")
      : "",

    kind === "simulado"
      ? [
          "## O que eu preciso",
          "1. As perguntas que essa apresentação provoca, no formato que eu descrevi acima. Se eu não descrevi, pergunte como ela funciona antes de montar a lista.",
          "2. Para cada pergunta, o que uma boa resposta precisa provar, em uma ou duas frases. Não escreva a resposta pronta para eu decorar.",
          "3. As três mais difíceis de responder com o que a sprint realmente entregou, e por que são difíceis.",
          "4. O que na minha entrega provavelmente vai chamar atenção pelo motivo errado.",
        ].join("\n")
      : [
          "## O que eu preciso",
          "1. Um roteiro da apresentação no formato que eu descrevi acima: o que mostrar, em que ordem e quanto de tempo dar a cada parte. Se eu não descrevi o formato, pergunte antes de montar o roteiro.",
          "2. Para cada artefato, o que precisa aparecer para ele ser considerado entregue.",
          "3. A história da sprint em três frases: o problema, o que foi construído e o que isso resolve.",
          "4. O que revisar antes de apresentar, começando pelo que mais pesa na nota.",
        ].join("\n"),

    RESPONSE_RULES(kind, "demo"),
  ];

  return blocks.filter(Boolean).join("\n\n");
}

export function buildExamPrompt(
  view: SectionView,
  subjects: ExamSubject[],
  format: ExamFormat,
  scope: ExamScope = {},
  kind: ExamPromptKind = "plano",
): string {
  if (scope.tipo === "demo" && scope.sprint) {
    return buildDemoPrompt(view, scope.sprint, scope, kind);
  }

  const desafio = scope.tipo === "desafio";
  const materia = desafio ? subjects[0] : undefined;
  const totalAulas = subjects.reduce((sum, s) => sum + s.aulas.length, 0);
  const weights = subjects.map((s) => s.aulas.length);
  const discursivas = distribute(format.discursivas, weights);
  const multipla = distribute(format.multipla, weights);
  const temSimulado = format.discursivas > 0 || format.multipla > 0;
  const pontos = examPoints(format);
  const exam = findExam(view);
  const diasRestantes = daysUntil(exam?.date ?? null);

  const ranking = subjects
    .map((s, i) => {
      const share = totalAulas > 0 ? Math.round((s.aulas.length / totalAulas) * 100) : 0;
      const pontos =
        (multipla[i] ?? 0) * format.valorMultipla + (discursivas[i] ?? 0) * format.valorDiscursiva;
      const estimativa = temSimulado
        ? `. Estimativa: ${questionCount(multipla[i] ?? 0, discursivas[i] ?? 0)}${
            pontos > 0 ? `, ${fmtPontos(pontos)} pontos da prova` : ""
          }`
        : "";
      return `${i + 1}. ${s.label}${s.professor ? ` (prof. ${s.professor})` : ""}${
        s.axis ? `, eixo ${s.axis}` : ""
      }: ${s.aulas.length} de ${totalAulas} aulas (${share}%), ${plural(
        s.materiais.length,
        "material de estudo",
        "materiais de estudo",
      )}${estimativa}`;
    })
    .join("\n");

  // Blocos, não linhas: cada seção é um pedaço inteiro e as ausentes (prova sem
  // enunciado, turma sem projeto) somem sem deixar linha em branco no meio.
  const avaliacao = desafio ? "o desafio" : "a prova final do módulo";

  const blocks = [
    kind === "simulado"
      ? `Sou estudante do Inteli e quero treinar para ${
          desafio ? `um desafio de ${materia?.label ?? "uma matéria"}` : avaliacao
        }. Monte um simulado no formato exato dele, para eu fazer no papel antes de ver o gabarito.`
      : `Sou estudante do Inteli e tenho ${
          desafio ? `um desafio de ${materia?.label ?? "uma matéria"}` : avaliacao
        } pela frente. Quero um plano de estudo para o tempo que ainda tenho.`,

    [
      "## Contexto",
      `Curso: ${view.section.type ?? "Graduação"} no Inteli${
        view.section.academicYear ? `, ${view.section.academicYear}º ano` : ""
      }`,
      `Turma: ${view.section.caption}`,
      desafio
        ? `Desafio de ${materia?.label ?? "matéria"}${
            materia?.professor ? ` (prof. ${materia.professor})` : ""
          }: vale nota e cobra só esta matéria, não o módulo inteiro.`
        : examLine(exam),
    ]
      .filter(Boolean)
      .join("\n"),

    !desafio && exam?.descriptionText && exam.descriptionText.length > 40
      ? ["## O que o Adalove diz sobre a prova", truncate(exam.descriptionText, MAX_EXAM_DESCRIPTION)].join("\n")
      : "",

    [
      desafio ? "## Formato do desafio" : "## Formato da prova",
      format.multipla > 0
        ? `- ${plural(
            format.multipla,
            "questão de múltipla escolha",
            "questões de múltipla escolha",
          )}, valendo ${fmtPontos(format.valorMultipla)} cada (${fmtPontos(pontos.multipla)} pontos)`
        : "- Nenhuma questão de múltipla escolha",
      format.discursivas > 0
        ? `- ${plural(
            format.discursivas,
            "questão discursiva",
            "questões discursivas",
          )}, valendo ${fmtPontos(format.valorDiscursiva)} cada (${fmtPontos(pontos.discursivas)} pontos)`
        : "- Nenhuma questão discursiva",
      temSimulado ? `- Total: ${fmtPontos(pontos.total)} pontos` : "",
      // Onde a nota se concentra muda o que vale estudar: um tema que só cai em
      // múltipla escolha se resolve reconhecendo; em discursiva, não.
      pontos.discursivas > 0 && pontos.multipla > 0
        ? `As discursivas são ${Math.round(
            (pontos.discursivas / pontos.total) * 100,
          )}% da nota em ${plural(format.discursivas, "questão", "questões")}: errar uma ali custa ${
            format.valorMultipla > 0
              ? `o mesmo que ${Math.round(format.valorDiscursiva / format.valorMultipla)} de múltipla escolha`
              : "caro"
          }.`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),

    // Só na prova final, e só quando vai sair simulado. O desafio também é prova
    // escrita, mas a gramática levantada das fotos é a DA PROVA FINAL: aplicar
    // ali seria afirmar de um desafio o que ninguém verificou. Lá o formato vem
    // do aluno, em `howItWorksBlock`.
    temSimulado && !desafio ? EXAM_STYLE : "",

    // O desafio é sempre prova escrita, então a gramática das provas (acima)
    // vale. O que muda de um para outro é o resto: quem faz, com consulta ou
    // não, quanto tempo. Isso só o aluno sabe.
    desafio
      ? howItWorksBlock("desafio", scope.howItWorks)
      : scope.notes?.trim()
        ? [
            "## Observações minhas (leia antes de tudo)",
            "Isto vem de mim, não do Adalove. Onde conflitar com o resto do prompt, isto aqui manda:",
            truncate(scope.notes, MAX_NOTES_CHARS),
          ].join("\n")
        : "",

    // Um desafio é de uma matéria só: ranking e distribuição não existem, e
    // listá-los faria a IA espalhar as questões por matérias que não caem.
    desafio
      ? [
          `## A matéria do desafio: ${materia?.label ?? ""}`,
          `Só ela cai, e dentro dela só o que está listado abaixo: ${plural(
            materia?.aulas.length ?? 0,
            "aula",
            "aulas",
          )} e ${plural(
            materia?.materiais.length ?? 0,
            "material de estudo",
            "materiais de estudo",
          )}. Eu escolhi esse recorte. Não traga conteúdo de outras matérias, nem de aulas que ficaram de fora, nem para comparar.`,
        ].join("\n")
      : [
          `## Matérias que caem${
            scope.excluded?.length ? " (recorte meu)" : ""
          }, da que teve mais aula para a que teve menos`,
          `O Adalove não diz o conteúdo da prova. O que dá para medir é quanto de aula cada matéria teve (${totalAulas} encontros ${
            scope.excluded?.length ? "no recorte" : "no módulo"
          }), e é esse o peso usado abaixo. Trate como estimativa, não como gabarito.`,
          // A exclusão precisa ser dita: a IA conhece os nomes das matérias pelo
          // resto do prompt e as traria de volta "para completar o estudo".
          scope.excluded?.length
            ? `Esta prova NÃO cobre ${scope.excluded.join(", ")}. Não inclua nada dessas matérias, nem no plano nem nas questões.`
            : "",
          "",
          ranking,
        ]
          .filter(Boolean)
          .join("\n"),

    materialBlock(
      scope.driveSearch,
      view,
      desafio
        ? `pelos títulos das aulas e pelo nome da matéria ("${materia?.label ?? ""}")`
        : `pelos títulos das aulas e pelas siglas das matérias (${subjects
            .map((s) => s.label)
            .join(", ")})`,
    ),

    [
      desafio ? "## Conteúdo da matéria" : "## Conteúdo visto em cada matéria",
      subjects
        .map((s) =>
          [
            `### ${s.label}: ${plural(s.aulas.length, "aula", "aulas")}`,
            titles(s.aulas, MAX_AULAS, "Aulas"),
            titles(s.materiais, MAX_MATERIAIS, "Materiais de estudo"),
          ]
            .filter(Boolean)
            .join("\n"),
        )
        .join("\n\n"),
    ].join("\n\n"),

    kind === "simulado"
      ? [
          "## O que eu preciso",
          desafio
            ? `1. O desafio inteiro de uma vez, numerado de 1 a ${
                format.multipla + format.discursivas
              }, com ${questionCount(
                format.multipla,
                format.discursivas,
              )}, todo dentro do conteúdo listado abaixo e no formato de questão que eu descrevi. Se eu não descrevi o formato, pergunte antes de inventar um.`
            : `1. A prova inteira de uma vez, numerada de 1 a ${
                format.multipla + format.discursivas
              }, com ${questionCount(
                format.multipla,
                format.discursivas,
              )}, distribuída pelo peso das matérias e nas formas descritas acima. Misture os tipos na mesma proporção, com a maioria em afirmativas numeradas.`,
          // Sem isto a IA responde cada questão logo abaixo dela, e o simulado
          // deixa de ser simulado: não dá para tentar antes de ver.
          "2. Nenhuma resposta no meio: o gabarito vem todo no fim, depois da última questão, para eu conseguir fazer antes de conferir.",
          "3. No gabarito, comente afirmação por afirmação nas questões de afirmativas (é isso que a prova cobra) e, nas de alternativa única, por que cada errada está errada.",
          "4. Nas discursivas, diga o que um corretor espera ver escrito na folha para dar nota cheia, não só o resultado.",
          desafio
            ? "5. Marque o tópico da matéria de cada questão no gabarito, para eu saber onde estou fraco."
            : "5. Marque a matéria de cada questão no gabarito, para eu saber em qual delas eu errei.",
        ].join("\n")
      : [
          "## O que eu preciso",
          desafio
            ? "1. Um plano de revisão da matéria, do que é base para o que é avançado, dizendo por onde começar hoje."
            : `1. Um plano priorizado${
                diasRestantes !== null && diasRestantes > 0
                  ? ` para os ${plural(diasRestantes, "dia", "dias")} que faltam`
                  : ""
              }, com quanto do meu tempo dar a cada matéria (proporcional ao peso acima) e o que fazer hoje.`,
          desafio
            ? "2. Os conceitos da matéria com mais cara de avaliação: o que é, para que serve e o erro clássico em cima dele."
            : "2. Para cada matéria, os conceitos com mais cara de prova: o que é, para que serve e o erro clássico em cima dele.",
          desafio
            ? "3. O que eu tenho que conseguir explicar em voz alta, e resolver no papel, para considerar cada tópico estudado."
            : "3. Um roteiro de revisão por matéria: o que eu tenho que conseguir explicar em voz alta para considerar aquele tópico estudado.",
          "4. Um checklist curto de autoavaliação, que revele se eu entendi mesmo ou só reconheci o assunto.",
          "5. O que costuma derrubar nota nesse tipo de avaliação, e como eu percebo isso em mim antes do dia.",
        ].join("\n"),

    RESPONSE_RULES(kind, desafio ? "desafio" : "final"),
  ];

  return blocks.filter(Boolean).join("\n\n");
}
