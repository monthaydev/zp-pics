import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import BotaoTema from "@/components/BotaoTema";
import MarcaZP from "@/components/MarcaZP";
import Tela from "@/components/Tela";
import { obterSessaoPorSlug } from "@/lib/galeria";
import { lerCracha } from "@/lib/sessao-cliente";
import { escalaCartaz, formatarData } from "@/lib/utils";

import SenhaClient from "./SenhaClient";

// O título nunca traz o nome do ensaio: ele apareceria no histórico do
// navegador e em qualquer print da aba.
export const metadata: Metadata = { title: "Entrar · ZP Pics" };

/**
 * Os três passos que a porta explica antes de pedir a senha.
 *
 * A maioria dos clientes nunca usou uma ferramenta de seleção, e o único passo
 * que pode dar errado de verdade — finalizar, que apaga as não escolhidas — é o
 * último. Quem chega sabendo disso não trava nos 40 minutos e não se assusta
 * com o aviso no fim. Escolhido pelo João em 22/10/2026 ("Como funciona",
 * `prototipos/senha/v2.html`).
 */
const PASSOS = [
  {
    titulo: "Olhe com calma",
    texto: "Abra qualquer foto em tela cheia para ver de perto. Dá para passar de uma para a outra sem fechar.",
  },
  {
    titulo: "Marque o coração",
    texto: "Cada marcação salva sozinha. Pode fechar e voltar depois, de onde parou.",
  },
  {
    titulo: "Finalize",
    texto: "O ZP Studio recebe a lista e trata só as escolhidas. As outras são apagadas.",
    alerta: true,
  },
];

export default async function SenhaPage({ params }: PageProps<"/s/[slug]/senha">) {
  const { slug } = await params;

  const sessao = await obterSessaoPorSlug(slug);
  // 404 seco. O que protege o ensaio é a entropia do slug — 12 caracteres
  // sorteados — e a senha, não fingir que todo link existe.
  if (!sessao) notFound();

  // Já entrou uma vez: não pede senha de novo a cada visita.
  if (await lerCracha(slug)) redirect(`/s/${slug}`);

  return (
    /*
      A porta de entrada é a única tela do produto sem foto nenhuma competindo
      por atenção — e é a primeira que a maioria dos clientes vê, porque chegam
      pelo link do WhatsApp e nunca passam pela home. Nenhuma foto aqui, nem
      miniatura: mostrar antes da senha entregaria o ensaio a quem só tem o link.

      Desktop: duas colunas — o ensaio e os passos à esquerda, a senha à
      direita. Celular: título, senha, passos, NESTA ordem. O cliente chega
      pelo WhatsApp para entrar; o campo não pode ficar três passos abaixo da
      dobra. A ordem do DOM é a do celular (e a do leitor de tela); o grid do
      desktop só reposiciona.
    */
    <Tela>
      <div className="relative min-h-svh sm:px-5">
        {/*
          Perfuração de 35mm, em CSS puro — herdada do site. Duas faixas
          laterais no desktop, uma superior no celular, onde largura é o
          recurso escasso. `aria-hidden`: é a borda do filme, não tem o que
          anunciar.
        */}
        <div aria-hidden className="sprockets absolute inset-y-0 left-0 hidden w-5 bg-superficie-2 sm:block" />
        <div aria-hidden className="sprockets absolute inset-y-0 right-0 hidden w-5 bg-superficie-2 sm:block" />
        <div aria-hidden className="sprockets h-5 bg-superficie-2 sm:hidden" />

        <BotaoTema className="absolute right-4 top-8 z-10 sm:right-10 sm:top-4" />

        <main className="grid min-h-svh lg:grid-cols-[1.1fr_0.9fr] lg:grid-rows-[auto_1fr]">
          <header className="flex flex-col gap-3 px-4 pb-bloco pt-secao sm:px-10 lg:border-r lg:border-linha-forte lg:px-16">
            <MarcaZP tamanho={44} className="mb-3" />
            {/* Reveal por máscara: a linha entra por baixo de um recorte. É o
                mesmo efeito do site, que lá custava GSAP + SplitText e aqui são
                duas regras de CSS. */}
            <h1 className="mascara-linha">
              <span
                style={{ fontSize: escalaCartaz(sessao.titulo) }}
                className="font-display uppercase leading-[0.94] tracking-cartaz text-balance"
              >
                {sessao.titulo}
              </span>
            </h1>
          </header>

          <section
            aria-label="Entrar"
            className="flex flex-col justify-center gap-bloco bg-superficie px-4 py-bloco sm:px-10 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:px-16"
          >
            <SenhaClient slug={slug} />

            <p className="text-apoio text-tinta-2">
              Você tem até {formatarData(sessao.prazo_em)} para escolher. O pacote
              inclui {sessao.fotos_incluidas} fotos.
            </p>
          </section>

          <section
            aria-labelledby="como-funciona"
            className="px-4 pb-secao pt-bloco sm:px-10 lg:col-start-1 lg:row-start-2 lg:border-r lg:border-linha-forte lg:px-16"
          >
            <h2 id="como-funciona" className="sr-only">
              Como funciona
            </h2>
            {/* Três frases, não um bloco de landing page: sem moldura e sem
                algarismo em display. A ordem importa (o último passo só vem
                depois dos outros), por isso continua lista numerada — o
                número é pequeno e mora na própria frase. */}
            <ol className="flex max-w-md flex-col gap-bloco">
              {PASSOS.map((passo, indice) => (
                <li key={passo.titulo} className="text-corpo text-tinta-2">
                  <span className="font-body font-semibold text-tinta">
                    {indice + 1}. {passo.titulo}.
                  </span>{" "}
                  {passo.texto}
                  {/* Ênfase em peso, não em `rec`: o laranja só marca seleção
                      e foco, e aqui não é nenhum dos dois. */}
                  {passo.alerta && (
                    <strong className="font-semibold text-tinta"> Não tem volta.</strong>
                  )}
                </li>
              ))}
            </ol>
          </section>
        </main>
      </div>
    </Tela>
  );
}
