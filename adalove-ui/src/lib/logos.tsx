import claudeRaw from "@logos/Claude.svg?raw";
import facebookRaw from "@logos/Facebook.svg?raw";
import geminiRaw from "@logos/Gemini.svg?raw";
import googleRaw from "@assets/img/Google.svg?raw";
import githubRaw from "@logos/GitHub.svg?raw";
import gitlabRaw from "@logos/GitLab.svg?raw";
import driveRaw from "@logos/GoogleDrive.svg?raw";
import instagramRaw from "@logos/Instagram.svg?raw";
import symbolInline from "@logos/InteliSymbolWhite.png?inline";
import linkedinRaw from "@logos/LinkedIn.svg?raw";
import openaiRaw from "@logos/OpenAI.svg?raw";
import slackRaw from "@assets/img/Slack.svg?raw";
import youtubeRaw from "@logos/Youtube.svg?raw";
import { cn } from "~/lib/cn";
import { ext } from "~/lib/ext";

// Os logos entram INLINE, não como <img src="data:…">: a CSP da página do
// Adalove pode barrar `img-src data:`, e SVG no DOM não passa por essa regra.
//
// Cada arquivo vem com width/height próprios (o do OpenAI tem 800px), então
// removemos os dois e deixamos o tamanho para o wrapper.
//
// Pegadinha: o GoogleDrive.svg não declara `viewBox`. Sem ele, trocar
// width/height por 100% não escala nada — o desenho fica no sistema de
// coordenadas original e some. Por isso derivamos o viewBox do tamanho
// declarado quando ele não existe.
function normalize(svg: string): string {
  return svg.replace(/<svg([^>]*)>/, (_, attrs: string) => {
    const width = /\swidth="([\d.]+)/.exec(attrs)?.[1];
    const height = /\sheight="([\d.]+)/.exec(attrs)?.[1];
    const stripped = attrs.replace(/\s(width|height)="[^"]*"/g, "");
    const viewBox =
      /\sviewBox="/.test(stripped) || !width || !height
        ? ""
        : ` viewBox="0 0 ${width} ${height}"`;
    return `<svg${stripped}${viewBox} width="100%" height="100%">`;
  });
}

/** Inline, os ids de `<defs>` viram globais da página. O Drive e o Google usam
 *  ambos `a`, `b`, `c`… — e `url(#b)` resolve para o PRIMEIRO `#b` do
 *  documento, então um logo pintava com o gradiente do outro (ou com algum id
 *  da própria página do Adalove). Prefixar por logo isola cada um. Duas cópias
 *  do mesmo logo repetem ids, mas com defs idênticas, então tanto faz qual vence. */
function scopeIds(svg: string, prefix: string): string {
  return svg
    .replace(/\sid="([^"]+)"/g, (_, id: string) => ` id="gi-${prefix}-${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_, id: string) => `url(#gi-${prefix}-${id})`)
    .replace(/href="#([^"]+)"/g, (_, id: string) => `href="#gi-${prefix}-${id}"`);
}

const RAW = {
  claude: claudeRaw,
  openai: openaiRaw,
  gemini: geminiRaw,
  drive: driveRaw,
  google: googleRaw,
  github: githubRaw,
  gitlab: gitlabRaw,
  facebook: facebookRaw,
  instagram: instagramRaw,
  linkedin: linkedinRaw,
  slack: slackRaw,
  youtube: youtubeRaw,
} as const;

const SVGS = Object.fromEntries(
  Object.entries(RAW).map(([name, raw]) => [name, scopeIds(normalize(raw), name)]),
) as Record<keyof typeof RAW, string>;

export type LogoName = keyof typeof SVGS;

const WHITE = /^(#fff|#ffffff|white)$/i;
/** Branco, preto ou já `currentColor`: cor sem marca, que não sobrevive à troca
 *  de tema sozinha. */
const ACHROMATIC = /^(#fff{1,3}|#ffffff|white|#000|#000000|black|currentColor)$/i;

/** Logo que é só silhueta: todas as cores visíveis são branco ou preto.
 *
 *  É o caso do OpenAI (branco puro) e do GitHub (o gato é branco). Desenhado
 *  para um fundo escuro, some no tema claro — e não há marca a preservar,
 *  porque a cor não é da marca, é do fundo para o qual o arquivo foi feito.
 *  Esses seguem a cor do texto sempre, sem o caller precisar saber.
 *
 *  `url(…)` é gradiente, e gradiente é cor de marca (Drive, Google): basta um
 *  para o logo não ser silhueta. E o que está dentro de `<mask>` não conta — o
 *  branco ou preto lá é recorte, não pintura. O Drive caía aqui justamente por
 *  isso: a máscara é `#fff` e o resto é gradiente, então o único fill "visível"
 *  era o branco do recorte, e o logo virava um triângulo cinza. */
function isSilhouette(svg: string): boolean {
  const painted = svg.replace(/<mask[\s\S]*?<\/mask>/gi, "");
  const fills = [...painted.matchAll(/fill(?:="|:)\s*([^";]+)/gi)]
    .map((m) => m[1]!.trim())
    .filter((f) => f !== "none");
  if (fills.some((f) => f.startsWith("url("))) return false;
  return fills.length > 0 && fills.every((f) => ACHROMATIC.test(f));
}

/** Deixa o logo seguir a cor do botão, para funcionar nos dois temas.
 *
 *  A parte difícil é o branco. No Facebook e no YouTube ele é vazado — o "f" e o
 *  triângulo são branco sobre a marca, e virar tudo `currentColor` daria um
 *  borrão sólido. Já no GitHub o branco É o gato: vazar ali apagaria o logo.
 *
 *  A regra que separa os dois casos sai do próprio arquivo: se existe algum fill
 *  que não é branco nem `none`, então o branco é vazado e recebe a cor do fundo
 *  do círculo; se o branco é a única cor, ele é a marca e vira `currentColor`.
 *
 *  Cobre tanto `fill="…"` (atributo) quanto `fill:…` (CSS), porque os arquivos
 *  vêm de fontes diferentes e usam as duas formas. */
function monochrome(svg: string): string {
  const declared = [...svg.matchAll(/fill(?:="|:)\s*([^";]+)/gi)].map((m) => m[1]!.trim());
  const hasBody = declared.some((f) => f !== "none" && !WHITE.test(f));

  const map = (value: string): string => {
    const v = value.trim();
    if (v === "none") return "none";
    if (hasBody && WHITE.test(v)) return "var(--gi-knockout, currentColor)";
    return "currentColor";
  };

  return svg
    .replace(/fill="([^"]*)"/g, (_, v: string) => `fill="${map(v)}"`)
    .replace(/fill:\s*([^;"}]+)/g, (_, v: string) => `fill:${map(v)}`);
}

/** O símbolo do Inteli só existe em PNG — não tem fill para trocar como nos
 *  SVGs. Então o desenho entra como MÁSCARA, que usa só o canal alpha, e a cor
 *  vem do fundo (`bg-current`): branco no tema escuro, como pedido, e escuro no
 *  claro. Pintar direto o PNG branco daria o mesmo resultado no escuro, mas ele
 *  desapareceria no tema claro — de máscara, a mesma arte serve nos dois.
 *
 *  A imagem vem de web_accessible_resources quando estamos na extensão: um
 *  `data:` URI em `mask-image` cai sob `img-src` na CSP da página do Adalove, que
 *  pode barrar. No harness de dev não existe a extensão, e aí o data: URI
 *  embutido no bundle serve — a página é nossa e não tem CSP no caminho. */
function symbolUrl(): string {
  return ext?.runtime?.getURL ? ext.runtime.getURL("logos/InteliSymbolWhite.png") : symbolInline;
}

export function InteliSymbol({ size = 22, className }: { size?: number; className?: string }) {
  const mask = `url("${symbolUrl()}") center / contain no-repeat`;
  return (
    <span
      aria-hidden
      className={cn("inline-block shrink-0 bg-current", className)}
      style={{ width: size, height: size, mask, WebkitMask: mask }}
    />
  );
}

export function Logo({
  name,
  size = 14,
  mono = false,
  className,
}: {
  name: LogoName;
  size?: number;
  /** Força a versão monocromática. Logos de silhueta já entram assim sozinhos. */
  mono?: boolean;
  className?: string;
}) {
  const raw = SVGS[name];
  const svg = mono || isSilhouette(raw) ? monochrome(raw) : raw;
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
