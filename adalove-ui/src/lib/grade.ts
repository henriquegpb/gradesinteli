// Escala de cor da nota, numa definição só: a mesma régua vale para a média de
// um módulo no Histórico e para a nota de uma atividade no cartão. Duas escalas
// para o mesmo 0–10 ensinariam ao aluno que "amarelo" muda de significado
// conforme a tela.
//
// Os cortes são os do Inteli: 6 passa, e acima disso o azul e o verde separam o
// "bom" do "excelente" sem transformar o painel num semáforo.

export function gradeColor(grade: number | null): string {
  if (grade == null) return "var(--color-fg-muted)";
  if (grade >= 9) return "var(--color-green)";
  if (grade >= 7) return "var(--color-blue)";
  if (grade >= 6) return "var(--color-yellow)";
  return "var(--color-red)";
}
