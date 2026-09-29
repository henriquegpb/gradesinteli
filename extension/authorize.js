// authorize.js — pede a permissão opcional de script.google.com.
//
// Ao conceder, grava `fichaAccessGrantedAt` no storage: a aba do Adalove escuta
// essa chave e recarrega as métricas sozinha, sem o aluno precisar dar F5.

const api = globalThis.browser ?? globalThis.chrome;
const ORIGINS = ["https://script.google.com/*"];

const button = document.getElementById("allow");
const status = document.getElementById("status");

async function granted() {
  await api.storage.local.set({ fichaAccessGrantedAt: Date.now() });
  status.className = "";
  status.textContent = "Pronto! Pode voltar para o Adalove.";
  button.disabled = true;
  setTimeout(() => window.close(), 700);
}

// Já concedida (aberta de novo por engano, ou concedida em outra janela).
api.permissions.contains({ origins: ORIGINS }).then((ok) => ok && granted());

button.addEventListener("click", async () => {
  status.className = "";
  status.textContent = "";
  try {
    // Precisa ser a primeira coisa do clique: o navegador só aceita o pedido
    // enquanto o gesto do usuário ainda vale.
    const ok = await api.permissions.request({ origins: ORIGINS });
    if (ok) return granted();
    status.className = "error";
    status.textContent = "Sem a permissão, a aba de Métricas avançadas não consegue buscar a ficha.";
  } catch (error) {
    status.className = "error";
    status.textContent = String(error?.message ?? error);
  }
});
