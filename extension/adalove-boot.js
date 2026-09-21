// adalove-boot.js — mundo isolado, document_start.
//
// Roda ANTES do React do Adalove montar. Se a preferência do aluno é a UI nova,
// esconde o #root deles já aqui, para não haver um piscar da tela branca antes
// da nossa overlay aparecer.
//
// `display:none` e não `remove()`: a UI original continua montada e viva, só
// invisível. Voltar é remover este <style> — nada é destruído, então nenhum bug
// nosso deixa o aluno sem plataforma.

(function () {
  const STYLE_ID = "gi-hide-root";

  // Mesma porteira do mount.tsx (adalove-ui/src/shell/routes.ts, que é a fonte
  // da verdade): fora das telas que reconstruímos a UI deles tem que aparecer.
  // Esconder o #root numa rota que não cobrimos daria tela em branco. A lista
  // vive duplicada aqui de propósito — este arquivo roda em document_start, sem
  // bundler, e precisa decidir antes de qualquer import.
  var OVERLAY_PATHS = [
    "/",
    "/academic-life",
    "/profile",
    "/feed",
    "/financial",
    "/menu",
    "/student-record",
    "/careers",
    "/exchange-program",
    "/mock-tests",
    "/service-channels",
    "/pages/calendar",
    "/pages/library",
    "/pages/institutional-norms",
    "/pages/tools",
    // Onde o Adalove larga quem abriu um endereço que ele não conhece: o 404 é
    // nosso também, senão um link quebrado devolvia a tela deles no meio da
    // navegação.
    "/not-found",
  ];

  var path = location.pathname.replace(/\/+$/, "") || "/";

  // `/academic-life/atividades` e `/academic-life/grupo` são endereços NOSSOS: o
  // kanban e o grupo moram dentro da Vida Acadêmica e não existem no Adalove.
  // O react-router deles não conhece esses caminhos e desvia para `/not-found`
  // assim que monta — antes do document_idle, quando a overlay sobe. Era por
  // isso que dar F5 no kanban (com ou sem cartão aberto) caía na página de "não
  // encontrada": a overlay já nascia lendo /not-found da barra de endereço.
  //
  // Aqui é document_start e é síncrono, então rodamos ANTES de qualquer script
  // da página: devolvemos o caminho real, que o React deles sabe renderizar, e
  // deixamos o pedido guardado para o mount.tsx recolocar o endereço no lugar.
  // Sem depender de corrida e sem o desvio chegar a acontecer.
  if (path.indexOf("/academic-life/") === 0) {
    try {
      sessionStorage.setItem("gi:boot-path", path);
    } catch (e) {
      /* storage bloqueado: no pior caso volta o 404 de antes */
    }
    // Query e hash seguem junto: são da pessoa, não nossos, e o caminho volta
    // ao que era no document_idle.
    history.replaceState(history.state, "", "/academic-life" + location.search + location.hash);
    path = "/academic-life";
  } else {
    // O valor é de UM carregamento só. Sem limpar, um /not-found de verdade
    // (link quebrado, endereço digitado errado) seria "restaurado" para o
    // kanban da última vez que esta aba carregou.
    try {
      sessionStorage.removeItem("gi:boot-path");
    } catch (e) {
      /* idem */
    }
  }

  var covered =
    OVERLAY_PATHS.indexOf(path) >= 0 ||
    path.indexOf("/academic-life/") === 0 ||
    path.indexOf("/exchange-program/") === 0;
  if (!covered) return;

  // Quem pediu o login do Adalove (o botão do Google, na nossa tela de entrada)
  // marcou esta aba. Aí a tela deles TEM que aparecer, e escondê-la aqui daria
  // uma página preta até o mount.tsx desfazer no document_idle. Só vale sem
  // sessão: com token, o desvio já cumpriu o papel e a overlay volta a mandar.
  // A chave vive duplicada aqui pelo mesmo motivo da lista acima — este arquivo
  // roda antes de qualquer import (fonte: adalove-ui/src/data/auth.ts).
  try {
    if (
      !localStorage.getItem("@buzz:token") &&
      sessionStorage.getItem("gi:adalove-login") === "1"
    ) {
      return;
    }
  } catch (e) {
    /* storage bloqueado: segue o fluxo normal */
  }

  chrome.storage.local.get("uiMode", (res) => {
    if (!res || res.uiMode !== "new") return;
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    // Mesma regra do mount.tsx: esconde a UI deles e solta html/body, para não
    // sobrar um segundo contexto de rolagem por trás da nossa página.
    style.textContent =
      "#root{display:none!important}" +
      "html,body{overflow:visible!important;height:auto!important;max-height:none!important;margin:0!important;background:#0e0e10!important;overscroll-behavior:none!important}" +
      // O botão "Abrir no GradesInteli" (adalove-content.js) é do fluxo da UI
      // original. Ele nasce aqui no document_start junto conosco, então a regra
      // precisa existir desde já — senão ele pisca na tela até o mount.tsx
      // reescrever este <style>. Casa pelo z-index inline dele.
      'button[style*="2147483647"]{display:none!important}';
    // Em document_start o <html> já existe; o <head> pode ainda não existir.
    (document.head || document.documentElement).appendChild(style);
  });
})();
