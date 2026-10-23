import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import BotaoTema from "@/components/BotaoTema";
import Tela from "@/components/Tela";
import { fotosEscolhidas, obterSessaoPorSlug } from "@/lib/galeria";
import { lerCracha } from "@/lib/sessao-cliente";

export const metadata: Metadata = { title: "Seleção enviada · ZP Pics" };

export default async function ResumoPage({ params }: PageProps<"/s/[slug]/resumo">) {
  const { slug } = await params;

  const sessao = await obterSessaoPorSlug(slug);
  if (!sessao) notFound();

  const cracha = await lerCracha(slug);
  if (!cracha || cracha.sessaoId !== sessao.id) redirect(`/s/${slug}/senha`);

  // Sessão ainda aberta não tem resumo: quem chegou aqui pelo histórico do
  // navegador volta pra grade em vez de ver uma lista pela metade.
  if ((sessao.status === "entregue" || sessao.status === "arquivada") && sessao.entregue_em) {
    redirect(`/s/${slug}/entrega`);
  }
  if (sessao.status !== "finalizada" && sessao.status !== "arquivada") redirect(`/s/${slug}`);

  const fotos = await fotosEscolhidas(sessao.id);
  const extras = Math.max(fotos.length - sessao.fotos_incluidas, 0);

  return (
    <Tela>
      <main className="mx-auto w-full max-w-4xl px-6 py-16">
        <div className="flex items-start justify-between gap-4">
          <p className="font-body text-hud font-medium text-tinta-2">
            Seleção enviada
          </p>
          <BotaoTema className="-mr-2 -mt-1 shrink-0" />
        </div>

        {/* O número sai do meio da frase e vira o herói: depois de 40 minutos
            de trabalho, a tela de recompensa abre com o resultado, não com um
            ícone de 20px. Mesmo `text-quadro` do contador de quadros da
            galeria — é o mesmo número, só que parado. */}
        <p className="mt-junto flex items-baseline gap-4 font-display leading-none text-tinta">
          <span className="text-quadro tabular-nums">{fotos.length}</span>
          <span className="text-corpo font-body normal-case tracking-normal text-tinta-2">
            fotos vão para o tratamento
          </span>
        </p>
        {extras > 0 && (
          <p className="mt-2 text-apoio text-tinta-3">
            Sendo <span className="font-hud text-rec-papel">{extras}</span> além do
            seu pacote de {sessao.fotos_incluidas}. O ZP Studio combina essas com
            você pelo WhatsApp.
          </p>
        )}

        {/* A máscara é o reveal do site do ZP Studio, aqui sem GSAP: o título
            entra por baixo de um recorte. Cabe nesta tela porque ela não tem
            nada disputando atenção — na grade de 400 seria ruído. */}
        <h1 className="mascara-linha mt-secao">
          <span className="font-display text-secao uppercase tracking-cine">
            {sessao.titulo}
          </span>
        </h1>

        {/* As escolhidas, com a cara delas.
            Sai de graça: são exatamente as fotos que NÃO foram apagadas do bucket
            ao finalizar. O cliente acabou de passar quarenta minutos escolhendo
            imagens — devolver a ele uma listagem de nomes de arquivo era premiar o
            trabalho com um `ls`. */}
        <section className="mt-bloco">
          <h2 className="font-body text-hud font-medium text-tinta-3">
            Suas fotos escolhidas
          </h2>

          {/* Mesma folha de contato da galeria: calha, número de quadro,
              sem moldura desenhada e sem crescer no hover. */}
          <ul className="mt-bloco grid grid-cols-2 items-start gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-4">
            {fotos.map((foto, indice) => (
              <li key={foto.id} className="foto-entra flex flex-col">
                <div
                  style={{ aspectRatio: `${foto.largura} / ${foto.altura}` }}
                  className="halation relative overflow-hidden bg-superficie"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element --
                      direto da nossa rota, igual à grade: a miniatura já sai
                      do navegador do admin no tamanho e no formato finais. */}
                  <img
                    src={`/api/img/${foto.key_thumb}`}
                    alt={`${foto.nome_original}, foto ${indice + 1} de ${fotos.length}`}
                    width={foto.largura}
                    height={foto.altura}
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    className="size-full object-cover"
                  />
                </div>

                <p className="mt-junto flex items-baseline gap-1.5 truncate font-hud text-quadronum">
                  <span className="shrink-0 tabular-nums text-rec-papel">
                    {String(indice + 1).padStart(3, "0")}
                  </span>
                  <span className="truncate text-tinta-3">{foto.nome_original}</span>
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* A lista corrida continua existindo: é o formato que serve pra conferir
            nome por nome, e agora sai do caminho de quem só queria ver as fotos. */}
        <details className="mt-secao">
          <summary className="cursor-pointer font-body text-hud font-medium text-tinta-3 transition-colors hover:text-tinta-2">
            Ver a lista de nomes
          </summary>

          <ol className="mt-bloco">
            {fotos.map((foto, indice) => (
              <li
                key={foto.id}
                className="flex items-center gap-4 py-1.5 font-hud text-apoio"
              >
                <span className="w-8 shrink-0 text-right text-tinta-3">
                  {indice + 1}
                </span>
                <span className="min-w-0 break-all text-tinta">
                  {foto.nome_original}
                </span>
              </li>
            ))}
          </ol>
        </details>
      </main>
    </Tela>
  );
}
