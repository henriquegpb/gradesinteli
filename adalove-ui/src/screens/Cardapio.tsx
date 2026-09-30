import {
  Apple,
  Banana,
  Bean,
  Beef,
  CakeSlice,
  Carrot,
  Citrus,
  Coffee,
  CupSoda,
  Drumstick,
  EggFried,
  Fish,
  GlassWater,
  Grape,
  Ham,
  Hamburger,
  IceCreamBowl,
  LeafyGreen,
  type LucideIcon,
  Milk,
  Pizza,
  Salad,
  Sandwich,
  Soup,
  Utensils,
  UtensilsCrossed,
  Wheat,
} from "lucide-react";
import { normalize } from "@/lib/normalize";
import { useApi } from "~/data/api";
import { Card, CardTitle } from "~/ui/Card";
import { Skeleton } from "~/ui/Skeleton";

interface TodaysMenu {
  protein_1: string | null;
  protein_2: string | null;
  vegan: string | null;
  alkaline: string | null;
  garnish: string | null;
  main_dish: string | null;
  salad: string | null;
  dessert: string | null;
}

type DishKey = keyof TodaysMenu;

const LABELS: Record<DishKey, string> = {
  protein_1: "Proteína 1",
  protein_2: "Proteína 2",
  vegan: "Vegano / Ovolacto",
  garnish: "Guarnição",
  alkaline: "Acompanhamentos",
  salad: "Salada",
  // A API chama de main_dish, mas o conteúdo é sempre a bebida do dia.
  main_dish: "Bebida",
  dessert: "Sobremesa",
};

const MAINS: DishKey[] = ["protein_1", "protein_2", "vegan"];
const SIDES: DishKey[] = ["garnish", "alkaline", "salad"];
const EXTRAS: DishKey[] = ["main_dish", "dessert"];

/** Palavra-chave → ícone, testadas em ordem sobre o nome do prato sem acento.
 *  A ordem importa: proteína vence tempero ("tilápia ao molho de limão" é peixe),
 *  bebida vence fruta ("suco de fruta" é bebida), folha vence grão ("salada com
 *  grão de bico" é salada). */
const FOOD_ICONS: [RegExp, LucideIcon][] = [
  [/\bhamburguer/, Hamburger],
  [/\bpizza/, Pizza],
  [/\b(peixe|tilapia|salmao|merluza|pescada|atum|bacalhau|sardinha|camarao|frutos do mar)/, Fish],
  [/\b(frango|galinha|sobrecoxa|coxinha da asa|peru|chester)/, Drumstick],
  [/\b(ovos?|omelete|fritada)\b/, EggFried],
  [/\b(porco|suin|pernil|lombo|bacon|linguica|presunto|costelinha|calabresa)/, Ham],
  [/\b(carne|bife|bovin|patinho|alcatra|picanha|costela|almondega|maminha|acem|cupim|fraldinha|file mignon|musculo|strogonoff|estrogonofe)/, Beef],
  [/\b(sopa|caldo|creme de)/, Soup],
  [/\b(sanduiche|lanche|wrap|pao)/, Sandwich],
  [/\b(cafe)\b/, Coffee],
  [/\b(leite|iogurte|vitamina)/, Milk],
  [/\b(suco|refrigerante|refresco|limonada|cha)\b/, CupSoda],
  [/\bagua\b/, GlassWater],
  [/\b(sorvete|gelato|acai)/, IceCreamBowl],
  [/\b(doce|bolo|torta|pudim|mousse|brigadeiro|brownie|gelatina|pave|cocada|sobremesa)/, CakeSlice],
  [/\bbanana/, Banana],
  [/\buvas?\b/, Grape],
  [/\b(laranja|limao|abacaxi|tangerina|mexerica)/, Citrus],
  [/\b(fruta|maca|melancia|melao|mamao|manga|morango)/, Apple],
  [/\b(salada|folhas|alface|rucula|agriao)/, Salad],
  [/\b(brocolis|couve|espinafre|repolho|acelga)/, LeafyGreen],
  [/\b(arroz|macarrao|massa|lasanha|nhoque|talharim|espaguete|penne|polenta|cuscuz|risoto|farofa|quinoa)/, Wheat],
  [/\b(feijao|feijoada|lentilha|grao de bico|ervilha|soja|tofu)/, Bean],
  [/\b(legume|cenoura|abobora|abobrinha|berinjela|batata|mandioca|beterraba|chuchu|vagem|pure)/, Carrot],
];

function foodIcon(dish: string): LucideIcon {
  const text = normalize(dish);
  return FOOD_ICONS.find(([re]) => re.test(text))?.[1] ?? Utensils;
}

function DishIcon({ dish, size }: { dish: string; size: number }) {
  const Icon = foodIcon(dish);
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-md border border-line bg-bg text-accent">
      <Icon size={size} aria-hidden />
    </span>
  );
}

function MainCard({ label, dish }: { label: string; dish: string }) {
  return (
    <Card className="flex items-start gap-3 p-4">
      <DishIcon dish={dish} size={16} />
      <div className="min-w-0">
        <CardTitle>{label}</CardTitle>
        <p className="mt-1 text-sm leading-snug text-fg">{dish}</p>
      </div>
    </Card>
  );
}

function DishList({ title, items }: { title: string; items: [DishKey, string][] }) {
  if (items.length === 0) return null;
  return (
    <Card className="p-4">
      <CardTitle>{title}</CardTitle>
      <ul className="mt-3 divide-y divide-line">
        {items.map(([key, dish]) => (
          <li key={key} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
            <DishIcon dish={dish} size={15} />
            <div className="min-w-0">
              <div className="text-xs text-fg-muted">{LABELS[key]}</div>
              <p className="mt-0.5 text-sm leading-snug text-fg">{dish}</p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function Cardapio() {
  const { data, loading, error } = useApi<TodaysMenu>("/restaurant-menus/todays-menu");

  const today = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

  const pick = (keys: DishKey[]) =>
    keys.flatMap((k): [DishKey, string][] => (data?.[k] ? [[k, data[k]]] : []));
  const mains = pick(MAINS);
  const sides = pick(SIDES);
  const extras = pick(EXTRAS);
  const empty = data && mains.length + sides.length + extras.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h1 className="text-xl font-medium text-fg">Cardápio</h1>
        <span className="text-xs capitalize text-fg-muted">{today}</span>
      </div>

      {loading && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            <Skeleton className="h-56 lg:col-span-2" />
            <Skeleton className="h-40" />
          </div>
        </div>
      )}

      {error && (
        <Card className="p-6">
          <p className="text-sm text-red">{error.message}</p>
        </Card>
      )}

      {data && !empty && (
        <>
          {mains.length > 0 && (
            <section className="space-y-3">
              <CardTitle>Pratos principais</CardTitle>
              <div className="grid gap-3 sm:grid-cols-3">
                {mains.map(([key, dish]) => (
                  <MainCard key={key} label={LABELS[key]} dish={dish} />
                ))}
              </div>
            </section>
          )}

          <div className="grid items-start gap-3 lg:grid-cols-3">
            <div className={extras.length > 0 ? "lg:col-span-2" : "lg:col-span-3"}>
              <DishList title="Acompanhamentos" items={sides} />
            </div>
            <DishList title="Bebida e sobremesa" items={extras} />
          </div>
        </>
      )}

      {empty && (
        <Card className="flex items-center gap-2 p-6">
          <UtensilsCrossed size={15} aria-hidden className="text-fg-muted" />
          <p className="text-sm text-fg-muted">Sem cardápio publicado para hoje.</p>
        </Card>
      )}
    </div>
  );
}
