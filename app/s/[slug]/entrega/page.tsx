import { Download } from "lucide-react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import BotaoTema from "@/components/BotaoTema";
import Tela from "@/components/Tela";
import { dividirEmPartes } from "@/lib/entrega-partes";
import { listarEntregasDoCliente } from "@/lib/entregas";
import { estadoDaEntrega } from "@/lib/entrega-cliente";
import { escalaCartaz, formatarData, formatarTamanho } from "@/lib/utils";

export const metadata: Metadata = { title: "Suas fotos tratadas · ZP Pics" };

/**
 * A página de entrega: onde o cliente baixa as fotos tratadas.
 *
 * Servidor puro, sem JavaScript no cliente: baixar é um link comum. O arquivo
 * que sai daqui é, byte a byte, o que a ZP exportou do Lightroom — é por isso
 * que a entrega é uma página com link, e não um anexo de e-mail ou uma foto
 * mandada pelo WhatsApp, que comprimem.
 */
export default async function EntregaPage({ params }: PageProps<"/s/[slug]/entrega">) {
  const { slug } = await params;

  const estado = await estadoDaEntrega(slug);
  if (!estado) notFound();
  if (estado.tipo === "sem-cracha") redirect(`/s/${slug}/senha`);

  const { sessao } = estado;

  // A ZP ainda não entregou: quem chegou aqui pelo histórico volta pra onde o
  // cliente de fato está no processo.
  if (estado.tipo === "nao-entregue") redirect(`/s/${slug}`);

  if (estado.tipo === "expirada") {
    return (
      <Tela>
        <main className="mx-auto flex min-h-svh w-full max-w-xl flex-col justify-center gap-4 px-6 py-16">
          <div className="flex items-start justify-between gap-4">
            <p className="font-hud text-hud uppercase tracking-cine text-tinta-3">ZP Studio</p>
            <BotaoTema className="-mr-2 -mt-1 shrink-0" />
          </div>
          <h1 className="font-display text-secao uppercase tracking-cine">{sessao.titulo}</h1>
          <p className="text-corpo text-tinta-2">
            O prazo para baixar as fotos terminou em{" "}
            {formatarData(sessao.entrega_expira_em as string)}, e os arquivos saíram do
            servidor. Fale com o ZP Studio, que reenvia.
          </p>
        </main>
      </Tela>
    );
  }

  const entregas = await listarEntregasDoCliente(sessao.id);
  const total = entregas.reduce((soma, e) => soma + e.tamanho_bytes, 0);
  // O zip sai em partes quando a entrega é grande (ver `lib/entrega-partes.ts`).
  const partes = dividirEmPartes(entregas);

  return (
    <Tela>
      <main className="mx-auto w-full max-w-7xl px-4 py-bloco sm:px-6">
        <header className="mb-bloco">
          <div className="flex items-start justify-between gap-4">
            <p className="font-hud text-hud uppercase tracking-cine text-tinta-3">
              ZP Studio · Fotos tratadas
            </p>
            <BotaoTema className="-mr-2 -mt-1 shrink-0" />
          </div>

          <h1 className="mascara-linha mt-3">
            <span
              style={{ fontSize: escalaCartaz(sessao.titulo) }}
              className="font-display uppercase leading-[0.94] tracking-cartaz text-balance"
            >
              {sessao.titulo}
            </span>
          </h1>

          {/* O número vira o herói, como no resumo da seleção: é o resultado
              de tudo que o cliente fez, não um detalhe numa linha. */}
          <p className="mt-bloco flex flex-wrap items-baseline gap-x-4 gap-y-1 font-display leading-none text-tinta">
            <span className="text-quadro tabular-nums">{entregas.length}</span>
            <span className="font-body text-corpo normal-case tracking-normal text-tinta-2">
              {entregas.length === 1 ? "foto tratada" : "fotos tratadas"} · {formatarTamanho(total)}
            </span>
          </p>

          <p className="mt-3 max-w-xl text-corpo text-tinta-2">
            Os arquivos são exatamente os que saíram do tratamento: tamanho original, sem
            compressão. Baixe todos de uma vez, ou um por um.
          </p>

          <div className="mt-bloco flex flex-wrap items-center gap-x-4 gap-y-3">
            {partes.map((parte, i) => (
              <a
                key={i}
                href={`/api/entrega/${slug}/zip${partes.length > 1 ? `?parte=${i + 1}` : ""}`}
                className="inline-flex h-12 items-center gap-3 bg-tinta px-6 font-body text-sm font-medium uppercase tracking-cine text-fundo transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.99]"
              >
                <Download className="size-4" aria-hidden />
                {partes.length > 1
                  ? `Parte ${i + 1} de ${partes.length} (.zip) · ${parte.length} ${parte.length === 1 ? "foto" : "fotos"} · ${formatarTamanho(parte.reduce((s, e) => s + e.tamanho_bytes, 0))}`
                  : "Baixar todas (.zip)"}
              </a>
            ))}
            <p className="font-hud text-hud uppercase tracking-cine text-tinta-3">
              Disponível até {formatarData(sessao.entrega_expira_em as string)}
            </p>
            {partes.length > 1 && (
              <p className="basis-full text-apoio text-tinta-3">
                São muitas fotos para um arquivo só, então o .zip vem em {partes.length} partes. Baixe uma
                de cada vez.
              </p>
            )}
          </div>
        </header>

        <ul className="grid grid-cols-2 items-start gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-4 xl:grid-cols-5">
          {entregas.map((e) => {
            const extensao = e.nome_arquivo.split(".").pop()?.toUpperCase() ?? "";
            return (
              <li key={e.id} className="flex flex-col">
                <a
                  href={`/api/entrega/${slug}/${e.id}`}
                  className="group relative block bg-superficie-2"
                  aria-label={`Baixar ${e.nome_arquivo}, ${formatarTamanho(e.tamanho_bytes)}`}
                >
                  {e.key_miniatura && e.largura && e.altura ? (
                    // eslint-disable-next-line @next/next/no-img-element -- direto da nossa rota, como a galeria.
                    <img
                      src={`/api/entrega/${slug}/${e.id}?miniatura=1`}
                      alt=""
                      width={e.largura}
                      height={e.altura}
                      loading="lazy"
                      decoding="async"
                      style={{ aspectRatio: `${e.largura} / ${e.altura}` }}
                      className="block size-full object-cover"
                    />
                  ) : (
                    // TIFF não abre no navegador: um quadro com o formato em vez
                    // de uma miniatura quebrada. O download é o mesmo.
                    <span className="flex aspect-[3/2] items-center justify-center font-display text-secao tracking-cine text-tinta-3">
                      {extensao}
                    </span>
                  )}
                  <span
                    aria-hidden
                    className="absolute bottom-0 right-0 flex size-11 items-center justify-center bg-gradient-to-tl from-black/55 to-transparent text-white"
                  >
                    <Download className="size-5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" />
                  </span>
                </a>
                {/* O nome é o identificador que o cliente lê em voz alta: um degrau mais forte que o tamanho. */}
                <p className="mt-1.5 truncate font-hud text-quadronum text-tinta-2">{e.nome_arquivo}</p>
                <p className="font-hud text-quadronum tabular-nums text-tinta-3">
                  {formatarTamanho(e.tamanho_bytes)}
                </p>
              </li>
            );
          })}
        </ul>
      </main>
    </Tela>
  );
}
