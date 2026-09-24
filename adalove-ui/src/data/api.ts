import { createContext, useContext, useEffect, useState } from "react";
import type { SessionState } from "~/data/client";

// Um cliente só para todas as telas novas: na extensão bate na apiv2, no
// harness de dev lê o fixture correspondente. Assim cada tela nova é só um
// `useApi("/caminho")` — sem condicional de ambiente espalhada pelo código.

export interface ApiClient {
  get: <T>(path: string) => Promise<T>;
  /** Ausente no harness de dev: lá as escritas viram no-op. */
  put?: (path: string, body?: unknown) => Promise<unknown>;
  post?: (path: string, body?: unknown) => Promise<unknown>;
  delete?: (path: string) => Promise<unknown>;
  /** Estado da sessão do Adalove, renovando o token quando está na hora — é por
   *  isso que devolve promessa. `unknown` quer dizer "não deu para saber agora"
   *  (rede fora), e quem chama deve manter o que já mostrava. */
  ensureSession?: () => Promise<SessionState>;
}

const ApiContext = createContext<ApiClient | null>(null);

export const ApiProvider = ApiContext.Provider;

export function useApiClient(): ApiClient | null {
  return useContext(ApiContext);
}

export interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

/** `path` null adia a chamada — útil quando depende de um uuid ainda ausente. */
export function useApi<T>(path: string | null): ApiState<T> {
  const client = useContext(ApiContext);
  const [state, setState] = useState<ApiState<T>>({
    data: null,
    loading: !!path,
    error: null,
  });

  useEffect(() => {
    if (!client || !path) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    let alive = true;
    setState({ data: null, loading: true, error: null });

    client
      .get<T>(path)
      .then((data) => alive && setState({ data, loading: false, error: null }))
      .catch((error: unknown) => {
        if (!alive) return;
        setState({
          data: null,
          loading: false,
          error: error instanceof Error ? error : new Error("Falha ao carregar"),
        });
      });

    return () => {
      alive = false;
    };
  }, [client, path]);

  return state;
}

/** Mesma regra do scripts/split-captures.mjs, para o dev achar o fixture certo. */
export function fixtureNameFor(path: string): string {
  return `${path
    .split("?")[0]!
    .replace(/^\//, "")
    .replace(/[0-9a-f]{24,36}/gi, "uuid")
    .replace(/\//g, "-")
    .replace(/[^a-z0-9-]/gi, "")
    .replace(/-+/g, "-")
    .toLowerCase()}.json`;
}
