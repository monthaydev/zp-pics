import Link from "next/link";

import BotaoTema from "@/components/BotaoTema";
import MarcaZP from "@/components/MarcaZP";
import Tela from "@/components/Tela";

import EntrarClient from "./EntrarClient";

/**
 * A porta da frente.
 *
 * Antes esta rota redirecionava pra `zpstudio.com.br` — domínio que ainda não
 * existe, então abrir o localhost jogava a aba num erro de DNS e não dava pra
 * chegar em lugar nenhum. Depois virou só o campo da chave, que resolve pra
 * quem veio do link do WhatsApp e não explica nada pra quem não veio.
 *
 * Agora ela faz as duas coisas: o campo continua sendo a primeira coisa da
 * tela — quem já tem a chave não deve ter que ler nada — e embaixo dele fica o
 * que a ferramenta é e o que vai acontecer depois de entrar.
 *
 * O título deixou de viver centrado numa coluna de 448px — o layout padrão de
 * qualquer landing genérica — e passou a sangrar na margem esquerda, em
 * `--texto-cartaz`. É a mesma folha de contato que a galeria usa: a
 * perfuração de 35mm na borda superior, e o cartaz do tamanho de um cartaz.
 */
export default function Home() {
  return (
    <Tela>
      <main className="relative mx-auto flex min-h-svh w-full max-w-5xl flex-col px-6 py-16 sm:px-10">
        {/* Perfuração 35mm na borda superior — o mesmo material da tela de
            senha, aqui porque é a outra porta de entrada do produto. */}
        <div
          aria-hidden
          className="sprockets absolute inset-x-0 top-0 hidden h-5 bg-superficie-2 sm:block"
        />

        <BotaoTema className="self-end" />

        <div className="mt-bloco flex flex-1 flex-col justify-center gap-bloco">
          <header className="flex flex-col gap-3">
            <MarcaZP tamanho={48} className="mb-3" />
            <h1 className="font-display text-cartaz uppercase tracking-cartaz text-balance">
              Suas
              <br />
              fotos
            </h1>
            <p className="max-w-md text-corpo text-tinta-2">
              Escolha as fotos do seu ensaio que você quer receber tratadas.
            </p>
          </header>

          <EntrarClient />
        </div>

        <ComoFunciona />

        <div className="mt-bloco text-center">
          <Link
            href="/admin"
            className="font-body text-hud font-medium text-tinta-3 transition-colors hover:text-tinta-2"
          >
            Sou do ZP Studio
          </Link>
        </div>
      </main>
    </Tela>
  );
}

/**
 * Os três passos são numerados porque são uma sequência de verdade — a ordem em
 * que as coisas acontecem com o cliente. Numeração que não representa ordem é
 * enfeite, e enfeite aqui é proibido.
 */
const PASSOS = [
  {
    titulo: "A chave chega pelo WhatsApp",
    texto:
      "O ZP Studio manda o link do seu ensaio junto com uma senha curta. É só isso que você precisa para entrar.",
  },
  {
    titulo: "Você marca as fotos",
    texto:
      "Clique no coração das fotos que você quer. Cada escolha salva sozinha, então dá pra fechar e voltar depois — até o prazo que aparece na tela.",
  },
  {
    titulo: "O estúdio trata só as escolhidas",
    texto:
      "Ao finalizar, sua lista vai direto para o ZP Studio. Só as fotos que você escolheu entram no tratamento.",
  },
];

function ComoFunciona() {
  return (
    <section className="mt-secao">
      <h2 className="font-body text-hud font-medium text-tinta-3">
        Como funciona
      </h2>

      {/* Três colunas no desktop, empilhado no celular — é onde a maioria
          dos clientes da ZP abre este link. Sem fio entre elas: o espaço
          já separa, e a numeração é uma palavra no título, não um bloco. */}
      <ol className="mt-bloco grid grid-cols-1 gap-bloco sm:grid-cols-3 sm:gap-x-10">
        {PASSOS.map((passo, indice) => (
          <li key={passo.titulo} className="min-w-0">
            <h3 className="font-body text-corpo font-semibold text-tinta">
              {indice + 1}. {passo.titulo}
            </h3>
            <p className="mt-junto text-apoio text-tinta-2">{passo.texto}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
