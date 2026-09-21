// A `description` das atividades vem como HTML da API do Adalove. É o mesmo
// conteúdo que a UI original já renderiza, mas como aqui ele entra no nosso
// shadow root, passamos por uma limpeza antes: remove scripts, conteúdo
// embutido de terceiros e handlers inline.

const FORBIDDEN = ["script", "iframe", "object", "embed", "link", "meta", "style", "form"];

/** Entidades nomeadas mais comuns em português, para o caminho sem DOM (testes em node). */
const ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
  agrave: "à", ccedil: "ç", atilde: "ã", otilde: "õ",
  acirc: "â", ecirc: "ê", ocirc: "ô", uuml: "ü",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú",
  Agrave: "À", Ccedil: "Ç", Atilde: "Ã", Otilde: "Õ",
  Acirc: "Â", Ecirc: "Ê", Ocirc: "Ô",
  hellip: "…", mdash: "—", ndash: "–", rsquo: "'", lsquo: "'",
  ldquo: '"', rdquo: '"', deg: "°", ordm: "º", ordf: "ª",
};

/** HTML → texto puro, com entidades decodificadas.
 *
 *  `cleanHtml` de @/lib/normalize decodifica só 6 entidades, o que deixaria
 *  "Pr&eacute;-processamento" no prompt da IA e na busca. `textContent` do
 *  DOMParser decodifica tudo de graça. */
export function htmlToText(html: string): string {
  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
  }
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&([a-zA-Z]+);/g, (match, name: string) => ENTITIES[name] ?? match)
    .replace(/\s+/g, " ")
    .trim();
}

/** Uma tag de verdade, e não um "<" solto do texto — um `P(x) < 1` do enunciado
 *  não pode passar por marcação. Só as tags que o conteúdo do Adalove usa. */
const HTML_TAG =
  /<\/?(?:p|div|br|hr|ul|ol|li|h[1-6]|table|thead|tbody|tr|t[hd]|a|img|strong|b|em|i|u|s|span|pre|code|blockquote|figure|sub|sup)\b[^>]*>/i;

/** Nem todo campo do Adalove vem como HTML. O feedback do professor costuma ser
 *  TEXTO puro, com as quebras de linha carregando toda a estrutura — a
 *  devolutiva de um desafio traz uma linha por questão. Num innerHTML cada `\n`
 *  vira um espaço e o feedback inteiro sai num parágrafo só, que é como a
 *  correção de oito questões virava um bloco ilegível.
 *
 *  Sem marcação, o texto é escapado e as quebras viram `<br>`. */
export function sanitizeTextOrHtml(value: string): string {
  if (HTML_TAG.test(value)) return sanitizeHtml(value);
  const div = document.createElement("div");
  // `textContent` escapa &, < e > de graça; sobra converter as quebras.
  div.textContent = value.trim();
  return div.innerHTML.replace(/\r\n|\r|\n/g, "<br>");
}

export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");

  doc.querySelectorAll(FORBIDDEN.join(",")).forEach((el) => el.remove());

  doc.querySelectorAll("*").forEach((el) => {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      // on*, javascript: e data: em href/src são as vias práticas de execução.
      if (name.startsWith("on")) el.removeAttribute(attr.name);
      else if (
        (name === "href" || name === "src") &&
        (value.startsWith("javascript:") || value.startsWith("data:text/html"))
      ) {
        el.removeAttribute(attr.name);
      }
    }
    if (el.tagName === "A") {
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer");
    }
  });

  return doc.body.innerHTML;
}
