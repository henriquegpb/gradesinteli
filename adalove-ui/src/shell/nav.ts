import {
  BookMarked,
  BookOpen,
  Briefcase,
  CalendarDays,
  FileText,
  Globe2,
  GraduationCap,
  Headset,
  LayoutDashboard,
  Newspaper,
  UtensilsCrossed,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/** Todas as telas são nossas. `atividades`, `grupo`, `prova-final` e `perfil`
 *  não têm item na sidebar: entram de dentro da Visão geral — pela semana, pelo
 *  "Ver todos" do card da turma, pelo botão de estudar para a prova e pela linha
 *  do usuário no topo. `nao-encontrada` também não: ninguém escolhe ir para um
 *  404, chega-se nele por link quebrado. */
export type RouteId =
  | "overview"
  | "atividades"
  | "grupo"
  | "prova-final"
  | "perfil"
  | "nao-encontrada"
  | "noticias"
  | "financeiro"
  | "cardapio"
  | "historico"
  | "carreiras"
  | "intercambio"
  | "simulados"
  | "pagina:calendar"
  | "pagina:library"
  | "pagina:institutional-norms"
  | "pagina:tools"
  | "atendimento";

export interface NavItem {
  id: RouteId;
  label: string;
  icon: LucideIcon;
}

/** Uso diário. "Acadêmico" no menu do Adalove é a nossa Visão geral. */
export const PRIMARY_ITEMS: NavItem[] = [
  { id: "overview", label: "Acadêmico", icon: LayoutDashboard },
  { id: "noticias", label: "Notícias", icon: Newspaper },
  { id: "financeiro", label: "Financeiro", icon: Wallet },
  { id: "cardapio", label: "Cardápio", icon: UtensilsCrossed },
];

/** Recolhido por padrão: telas que se abre poucas vezes por semestre. */
export const SECONDARY_ITEMS: NavItem[] = [
  { id: "historico", label: "Histórico e CRA", icon: GraduationCap },
  { id: "carreiras", label: "Carreiras", icon: Briefcase },
  { id: "intercambio", label: "Intercâmbio", icon: Globe2 },
  { id: "simulados", label: "Simulados", icon: BookMarked },
  { id: "pagina:calendar", label: "Calendário acadêmico", icon: CalendarDays },
  { id: "pagina:library", label: "Biblioteca", icon: BookOpen },
  { id: "pagina:institutional-norms", label: "Normas institucionais", icon: FileText },
  { id: "pagina:tools", label: "Ferramentas", icon: Wrench },
  { id: "atendimento", label: "Atendimento", icon: Headset },
];

export const NAV_ITEMS: NavItem[] = [...PRIMARY_ITEMS, ...SECONDARY_ITEMS];

export interface AdaloveLink {
  label: string;
  path: string;
  icon: LucideIcon;
}

/** Nada mais sai daqui para o Adalove: todas as telas do menu foram
 *  reconstruídas. Mantido vazio de propósito — a Sidebar já sabe lidar. */
export const ADALOVE_LINKS: AdaloveLink[] = [];
