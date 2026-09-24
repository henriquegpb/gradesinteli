import { ArrowRight } from "lucide-react";
import { Logo, type LogoName } from "~/lib/logos";

// Rodapé com os sociais do Inteli e os de quem escreveu esta UI. O Adalove tem
// um rodapé equivalente; este mantém a informação e troca a apresentação.

interface Social {
  label: string;
  href: string;
  logo: LogoName;
  /** Cor da marca — entra no anel, no brilho e na flecha do hover. */
  brand: string;
}

const INTELI: Social[] = [
  {
    label: "Inteli no Facebook",
    href: "https://www.facebook.com/inteliedu/?locale=pt_BR",
    logo: "facebook",
    brand: "#0866ff",
  },
  {
    label: "Inteli no Instagram",
    href: "https://www.instagram.com/inteli_edu/?igshid=YmMyMTA2M2Y%3D",
    logo: "instagram",
    brand: "#e4405f",
  },
  {
    label: "Inteli no LinkedIn",
    href: "https://br.linkedin.com/school/inteli-edu/",
    logo: "linkedin",
    brand: "#0a66c2",
  },
  {
    label: "Inteli no YouTube",
    href: "https://www.youtube.com/@inteli-institutodetecnolog588",
    logo: "youtube",
    brand: "#ed1d24",
  },
];

const DEV: Social[] = [
  {
    label: "Henrique Barone no LinkedIn",
    href: "https://www.linkedin.com/in/hbarone/",
    logo: "linkedin",
    brand: "#0a66c2",
  },
  {
    label: "Henrique Barone no GitHub",
    href: "https://github.com/henriquegpb",
    logo: "github",
    brand: "var(--color-fg)",
  },
  {
    label: "Henrique Barone no Instagram",
    href: "https://www.instagram.com/henrique_barone/",
    logo: "instagram",
    brand: "#e4405f",
  },
];

/** O logo sobe e sai do círculo enquanto a flecha sobe para o lugar dele. Os
 *  dois se movem juntos, então parece uma peça só girando — e o `overflow-hidden`
 *  do círculo é o que recorta a troca. */
function SocialLink({ social }: { social: Social }) {
  return (
    <a
      href={social.href}
      target="_blank"
      rel="noopener noreferrer"
      title={social.label}
      aria-label={social.label}
      className="gi-social group/social relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-surface transition-colors duration-200"
      style={{ ["--brand" as string]: social.brand }}
    >
      <span className="gi-social-swap flex items-center justify-center">
        <Logo name={social.logo} size={16} mono />
      </span>
      <span className="gi-social-swap gi-social-arrow absolute inset-0 flex items-center justify-center">
        <ArrowRight size={15} aria-hidden />
      </span>
    </a>
  );
}

function SocialGroup({
  title,
  subtitle,
  socials,
}: {
  title: string;
  subtitle: string;
  socials: Social[];
}) {
  return (
    <div className="min-w-0">
      <div className="text-[0.62rem] font-medium uppercase tracking-[0.08em] text-fg-muted">
        {title}
      </div>
      <p className="mt-1 text-xs text-fg-soft">{subtitle}</p>
      {/* `cursor-pointer` no container: o círculo é redondo mas a caixa do
          link é quadrada, então os cantos e os vãos ficam fora da área clicável
          e o cursor piscava de volta para a seta ao varrer a fileira. */}
      <div className="mt-3 flex cursor-pointer flex-wrap items-center gap-2">
        {socials.map((s) => (
          <SocialLink key={s.href} social={s} />
        ))}
      </div>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="mt-10 border-t border-line pt-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <SocialGroup
          title="Inteli"
          subtitle="Instituto de Tecnologia e Liderança"
          socials={INTELI}
        />
        <SocialGroup
          title="UI por Henrique Barone"
          subtitle="Aluno do Inteli · esta interface é open source"
          socials={DEV}
        />
      </div>
    </footer>
  );
}
