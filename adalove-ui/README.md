# Adalove UI

Uma segunda pele para o Adalove, renderizada dentro da própria página, ligada por um botão.

É **aditivo**: o app Next em `../src`, o site em produção e o fluxo de importação atual da extensão
não são tocados. A UI original do Adalove nunca é destruída — só escondida — então voltar é sempre
um clique e nenhum bug daqui deixa o aluno sem plataforma.

## Rodar

```bash
npm install
npm run dev     # localhost:5173, HMR, contra um fixture gravado
npm run build   # → ../extension/dist/adalove-ui.js  (IIFE único, sem code-splitting)
npm run typecheck
```

95% do trabalho de UI acontece no `npm run dev`, sem Adalove e sem rede. O Adalove real só entra
para validar o mount e a integração.

Parâmetros do harness:

| Param | Efeito |
|---|---|
| `?fixture=nome` | escolhe o arquivo de `fixtures/` (padrão: `henrique-2026-2A`) |
| `?route=notas` | abre direto numa tela (`overview`, `atividades`, `notas`, `faltas`, `grupo`) |
| `?open=3` | abre o modal do n-ésimo card |
| `?fail=1` | faz o `persistStatus` falhar, para exercitar o rollback do kanban |
| `?expired=1` | finge sessão do Adalove vencida, para ver a faixa de sessão expirada |
| `?revision=…` | pedido de revisão: `open` (padrão), `none`, `late`, `pending`, `deferred`, `undeferred`, `broken` |

## Rotas

Cada tela nossa mora na **mesma URL** que a página equivalente do Adalove — os caminhos saem do
`GET /users/menus` dele. Trocar de tela empurra o endereço (`history.pushState`), então voltar e
avançar do navegador andam pelas telas, F5 recarrega onde a pessoa estava e o link é
compartilhável. O mapa é `src/shell/routes.ts`:

| Tela | URL |
|---|---|
| `overview` | `/academic-life` (e `/`) |
| `atividades` / `grupo` / `prova-final` | `/academic-life/atividades`, `/academic-life/grupo`, `/academic-life/prova-final` (sintéticos: não existem no Adalove) |
| `perfil` | `/profile` |
| `noticias` | `/feed` |
| `financeiro` | `/financial` |
| `cardapio` | `/menu` |
| `historico` | `/student-record` |
| `carreiras` | `/careers` |
| `intercambio` | `/exchange-program/partners` (e `/notices`) |
| `simulados` | `/mock-tests` |
| `atendimento` | `/service-channels` |
| `pagina:*` | `/pages/calendar`, `/pages/library`, `/pages/institutional-norms`, `/pages/tools` |
| `nao-encontrada` | `/not-found` (para onde o Adalove manda todo endereço que ele não conhece) |

Endereço fora do mapa (`/checkin`, `/notifications`, `/surveys`) é do Adalove: a overlay desmonta e
a página deles aparece. A mesma lista está duplicada em `../extension/adalove-boot.js`, que roda em
`document_start` sem bundler — `routes.ts` é a fonte da verdade.

O react-router do Adalove não escuta `pushState`. Então, se houve navegação nossa, voltar para a UI
original faz um carregamento de verdade no endereço equivalente (`canonicalPath`), em vez de
mostrar a página deles desencontrada da URL.

## Como se conecta ao Adalove

Toda a tela de Vida Acadêmica roda nestes endpoints (extraídos do bundle do próprio Adalove):

```
GET  /sections/{sectionUuid}/userdata                        ← kanban, notas, faltas, grupo: tudo
GET  /student-activities/{uuid}/activity/data                ← material, vídeo, assuntos, tarefas
PUT  /student-activities/{uuid}/status    {sort, status}     ← arrastar card
PUT  /student-activities/{uuid}/autosave  {campo: valor}     ← resposta, anotações, tags
POST   /student-activity-tasks/student-activity/{uuid}          {caption}
PUT    /student-activity-tasks/{task}/student-activity/{uuid}/status  {status}
DELETE /student-activity-tasks/{task}/student-activity/{uuid}
GET  /student-activity-grade-revisions/student-activity/{uuid}
POST /student-activity-grade-revisions    {studentActivityUuid, reason}
```

O `/autosave` é um mapa de campos, não um campo fixo — é por ele que resposta, anotações e tags
gravam. Os nomes de ESCRITA não são os de leitura (`activityStudyAnswer` ↔ `studyAnswer`), e é por
isso que `App.handleFields` traduz antes de remendar o `raw`. As tarefas são o único estado do
cartão que não passa pelo `raw`: não vêm no /userdata, só no endpoint de detalhe.

Os dois últimos são o pedido de revisão de nota, no fim da aba de Avaliação do cartão. O GET
responde `{ canRequest, deadlineAt, revision }`; sem prazo e sem pedido não há nada a mostrar e a
seção some. O caso sem pedido está conferido contra a API real; o objeto `revision` não, porque só
chega depois de alguém pedir revisão — por isso cada campo dele é opcional na renderização
(`?revision=broken` exercita isso), em vez de um nome errado derrubar a overlay. Prova fica de fora — lá a revisão é por questão, em `/…/exam/student-activity/{uuid}`,
numa tela que ainda não reconstruímos. Os carimbos de data vêm **sem fuso** e são hora de parede:
`formatNaiveDateTime` os lê do texto, porque convertê-los mudaria o prazo de dia.

O token está em `localStorage["@buzz:token"]` na origem do Adalove. O content script roda no mundo
ISOLADO **na mesma origem**, então lê direto: nada de ponte com o mundo MAIN, e **o token nunca sai
do navegador**. Status: `1 = A fazer`, `2 = Fazendo`, `3 = Feito`.

Se a chamada direta falhar, cai para o `lastCapture` que o `adalove-interceptor.js` já grava.

## Estrutura

```
src/
  mount.tsx      entry da extensão: shadow root + adoptedStyleSheets + botão de toggle
  dev.tsx        entry do localhost
  App.tsx        roteamento e estado; optimistic update do kanban
  theme.css      Tailwind v4 com os tokens do GradesInteli
  data/          client (API), auth (login/logout no Cognito), viewmodel (JSON → telas),
                 activityTypes (tabela oficial), gradeRevision (pedido de revisão),
                 organization (tags, tarefas, anotações)
  ui/            primitivas (Card, Button, Badge, Table, Tabs, Modal, Html, …)
  shell/         Sidebar, mapa de rotas (routes.ts) e navegação por URL (history.ts)
  screens/       Login, Overview, Atividades, Notas, Faltas, Grupo, ProvaFinal, ActivityModal,
                 ActivityOrganization, GradeRevision
  ai/            prompt.ts / summary.ts / exam.ts (puros), providers.ts, AskAiButton
```

**Cálculo de nota não é reimplementado aqui.** `data/viewmodel.ts` delega a
`@/lib/adalove-json-parser`, `@/lib/grade-calculator` e `@/lib/attendance-parser` — os mesmos
módulos que o site usa em produção. Duas implementações divergiriam em silêncio, e é aí que dói.

Alias: `@/` aponta para `../src` (mesmo significado do tsconfig da raiz, para os módulos
compartilhados importarem sem tradução) e `~/` para o código daqui.

## Dois eixos de classificação

Não confunda:

- **`kind`** — o tipo oficial do Adalove, vindo do campo numérico `type` (Autoestudo,
  Desenvolvimento de Projetos, Encontro de Instrução…). Define ícone e cabeçalho do modal.
- **`category`** — a categoria de nota (Ponderada, Artefato, Autoavaliação, Prova, Grupo, Aula).
  Define a cor e o bucket de peso. Sai do `type` quando ele é conclusivo (21/92 = Artefato,
  31 = Autoavaliação) e do título quando não é — `type: 11` cobre tanto material sem peso quanto
  ponderada avaliada. Pelo título sozinho, os artefatos de GRAD SI ("Testes Unitários",
  "Estratégia de Cut Over") caíam inteiros em Ponderada.

Uma atividade pode ser Autoestudo (`kind`) e Ponderada (`category`) ao mesmo tempo.

## Modo de captura — levantar o contrato de uma página nova

Para reconstruir uma tela do Adalove precisamos do payload que ela consome. Em vez
de abrir o DevTools em cada página, a extensão grava sozinha:

1. Abra o Adalove, console do navegador: `__gradesinteliCapture.on()`
2. Navegue pelas páginas que quer reconstruir. Um badge amarelo no canto mostra
   quantos endpoints já entraram.
3. Clique em **Exportar** no badge → baixa um JSON com tudo.

Cada resposta da `apiv2.inteli.edu.br` é gravada, **uma por endpoint**: a chave é
`MÉTODO /caminho` com uuids e ids trocados por `:uuid`/`:id`, então a mesma rota
chamada dez vezes não vira dez entradas. É o contrato que interessa, não o
histórico. Corpos acima de 1,2MB entram sem body para não estourar a cota.

Isso pega também os endpoints secundários que a página chama sem avisar — a Vida
Acadêmica, por exemplo, usa três.

Outros comandos: `await __gradesinteliCapture.list()`, `.off()`, `.clear()`.

Depois, quebre o export em um fixture por endpoint:

```bash
node scripts/split-captures.mjs ../data/adalove-capturas-2026-08-11.json
```

As telas novas usam `useApi("/caminho")`, que resolve o fixture correspondente no
dev e bate na apiv2 na extensão — o mapeamento caminho → arquivo é o mesmo dos
dois lados (`fixtureNameFor` em `src/data/api.ts`).

Implementação: [extension/adalove-capture.js](../extension/adalove-capture.js) observa
no mundo MAIN e `src/capture.ts` guarda e exporta no isolado. O
`adalove-interceptor.js`, que alimenta a importação de notas em produção, segue
intocado.

## Fixtures

`fixtures/*.json` são capturas reais de `/userdata`. Um fixture só (3º ano) esconde bugs de outros
anos — já houve um. A exceção é o pedido de revisão de nota: como o recurso é posterior às capturas
e `fixtures/` não vai para o git, os payloads dele são encenados em `dev.tsx` (`REVISION_VARIANTS`),
a partir do contrato do bundle. Para pedir capturas a colegas sem vazar dados de terceiros:

```bash
node scripts/anonymize-fixture.mjs captura.json fixtures/turma-1ano.json
```

Troca nomes de alunos e professores por sintéticos, preservando uuids, grupos e pesos.

## Shadow DOM: as duas armadilhas

1. **`@theme` do Tailwind compila para `:root`, que não casa dentro de um shadow root.**
   `mount.tsx` reescreve `:root` → `:host` ao injetar o CSS. No dev (sem shadow root) o `:root`
   original vale, então a mesma folha serve aos dois.
2. **`@font-face` declarado dentro do shadow root não carrega** — o registro de fontes é do
   documento. `lib/fonts.ts` injeta no `document.head` apontando para `web_accessible_resources`.
