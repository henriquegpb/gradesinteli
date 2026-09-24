import type { Metadata } from "next";
import styles from "./privacy.module.css";

export const metadata: Metadata = {
  title: "Política de Privacidade | GradesInteli",
  description:
    "Como o GradesInteli e a extensão Adalove → GradesInteli tratam os seus dados.",
};

export default function PrivacyPage() {
  return (
    <main className={styles.page}>
      <article className={styles.content}>
        <h1>Política de Privacidade</h1>
        <p className={styles.updated}>Última atualização: 11 de agosto de 2026</p>

        <p>
          O <strong>GradesInteli</strong> e a extensão de navegador{" "}
          <strong>Adalove → GradesInteli</strong> foram feitos para ajudar alunos do
          Inteli a acompanharem sua vida acadêmica. Esta política explica, de forma
          direta, o que acontece com os seus dados.
        </p>

        <h2>Resumo</h2>
        <p>
          Nós <strong>não temos servidor</strong>. Nenhum dado seu é enviado, guardado ou
          processado por nós. Tudo acontece dentro do seu próprio navegador, entre você e
          os sistemas do Inteli, com a sessão que você já tem aberta.
        </p>

        <h2>O que a extensão faz</h2>
        <p>Ela tem duas funções, e você escolhe qual usar:</p>
        <ul>
          <li>
            <strong>Exportar notas para o dashboard.</strong> A extensão observa a
            resposta que o próprio Adalove já carregou com as suas notas e a entrega para
            a aba do GradesInteli quando você clica no botão.
          </li>
          <li>
            <strong>Interface alternativa dentro do Adalove.</strong> Quando você ativa a
            UI nova, a extensão passa a consultar a API do Inteli diretamente para montar
            as telas.
          </li>
        </ul>

        <h2>Sobre a sua sessão do Adalove</h2>
        <p>
          Para montar a interface alternativa, a extensão <strong>lê o token de sessão
          que o Adalove já guardou no seu navegador</strong> e o usa para consultar a API
          do Inteli em seu nome, exatamente como a página do Adalove faz. O token{" "}
          <strong>nunca sai do seu dispositivo</strong>: ele não é enviado para nós, não é
          copiado para lugar nenhum e não é guardado pela extensão. A extensão também não
          faz login por você nem tem acesso à sua senha.
        </p>

        <h2>Quais dados são acessados</h2>
        <p>
          Apenas os seus, e apenas para desenhar a tela que você está olhando. Dependendo
          da página aberta, isso inclui: atividades, notas, pesos e presenças da sua
          turma; membros do seu grupo; histórico escolar e CRA; notícias e cardápio;
          boletos e notas fiscais; vagas de estágio, intercâmbio e simulados; e, na tela
          de perfil, os seus dados cadastrais no Inteli, incluindo nome, e-mail,
          telefone, CPF e endereço. Nada disso é transmitido para fora do seu navegador.
        </p>

        <h2>O que a extensão grava no seu navegador</h2>
        <ul>
          <li>
            Suas preferências: qual interface você escolheu, o tema claro/escuro e os
            parâmetros do simulador de notas.
          </li>
          <li>
            A última resposta de notas capturada, para que o botão de exportar funcione
            sem recarregar a página. Ela é sobrescrita a cada nova captura e some quando
            você desinstala a extensão ou limpa os dados dela.
          </li>
          <li>
            No site do GradesInteli, os dados ficam no <code>localStorage</code> do seu
            navegador. Você pode apagá-los a qualquer momento limpando os dados do site.
          </li>
        </ul>

        <h2>O que a extensão altera na sua conta</h2>
        <p>
          Quase nada, e só por ação sua: mover um card de atividade entre as colunas
          (a fazer / fazendo / feito) e marcar notificações como lidas. São as mesmas
          ações que a interface original do Adalove oferece.
        </p>

        <h2>Quando algo sai do seu navegador</h2>
        <p>
          Existe <strong>um único caso</strong>, e ele depende de um clique seu: os botões
          &ldquo;Explicar com IA&rdquo; e &ldquo;Resumir com IA&rdquo; abrem o ChatGPT, o
          Claude ou o Gemini com um texto pronto sobre a atividade: enunciado, matéria e
          semana. Esse texto vai para o serviço de IA que você escolheu, e passa a seguir
          a política de privacidade dele. Se você não clicar nesses botões, nada é enviado.
        </p>

        <h2>O que NÃO fazemos</h2>
        <ul>
          <li>Não temos servidor e não recebemos nenhum dado seu.</li>
          <li>Não vendemos, compartilhamos nem cedemos seus dados a terceiros.</li>
          <li>Não usamos seus dados para publicidade nem para perfilamento.</li>
          <li>Não guardamos o seu token de sessão nem temos acesso à sua senha.</li>
          <li>Não acessamos dados de outros alunos além do que a sua própria turma já mostra a você.</li>
        </ul>

        <h2>Permissões da extensão</h2>
        <ul>
          <li>
            <strong>adalove.inteli.edu.br</strong>: ler a página e a sessão para exibir
            suas notas, atividades e presenças, e desenhar a interface alternativa.
          </li>
          <li>
            <strong>apiv2.inteli.edu.br</strong>: consultar a API acadêmica do Inteli em
            seu nome, com a sua própria sessão, para montar as telas.
          </li>
          <li>
            <strong>www.gradesinteli.com</strong>: entregar as notas ao dashboard quando
            você clica em exportar.
          </li>
          <li>
            <strong>armazenamento (storage)</strong>: guardar as preferências e a última
            captura de notas, sempre no seu dispositivo.
          </li>
        </ul>
        <p>
          As imagens de foto de perfil são carregadas do mesmo servidor de arquivos que o
          Adalove usa.
        </p>

        <h2>Sobre o site gradesinteli.com</h2>
        <p>
          O site usa o Vercel Analytics, que registra medições agregadas de acesso às
          páginas (como visitas e país de origem). Ele não recebe as suas notas nem os
          seus dados acadêmicos, que ficam apenas no seu navegador.
        </p>

        <h2>Código aberto</h2>
        <p>
          Tudo que está descrito aqui pode ser conferido no código, que é público. Se algo
          nesta política não corresponder ao que o código faz, o código é a verdade, e
          por favor nos avise.
        </p>

        <h2>Contato</h2>
        <p>
          Dúvidas sobre privacidade? Escreva para{" "}
          <a href="mailto:henrique@noraai.co">henrique@noraai.co</a> ou abra uma issue no{" "}
          <a
            href="https://github.com/henriquegpb/gradesinteli"
            target="_blank"
            rel="noopener noreferrer"
          >
            repositório no GitHub
          </a>
          .
        </p>

        <p className={styles.back}>
          <a href="/">← Voltar ao GradesInteli</a>
        </p>
      </article>
    </main>
  );
}
