import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import BotaoTema from "@/components/BotaoTema";
import Tela from "@/components/Tela";
import { idsEscolhidos, listarFotosDaGaleria, obterSessaoPorSlug } from "@/lib/galeria";
import { lerCracha } from "@/lib/sessao-cliente";
import { formatarData } from "@/lib/utils";

import GaleriaClient from "./GaleriaClient";

export const metadata: Metadata = { title: "Suas fotos · ZP Pics" };

export default async function GaleriaPage({ params }: PageProps<"/s/[slug]">) {
  const { slug } = await params;

  const sessao = await obterSessaoPorSlug(slug);
  if (!sessao) notFound();

  const cracha = await lerCracha(slug);
  if (!cracha || cracha.sessaoId !== sessao.id) redirect(`/s/${slug}/senha`);

  // A ZP já entregou as tratadas: o link que o cliente guardou (o mesmo da
  // seleção) passa a levar para onde ele baixa. Arquivada DEPOIS de entregar
  // também — a entrega continua valendo até o prazo.
  if ((sessao.status === "entregue" || sessao.status === "arquivada") && sessao.entregue_em) {
    redirect(`/s/${slug}/entrega`);
  }

  const [fotos, escolhidas] = await Promise.all([
    listarFotosDaGaleria(sessao.id),
    idsEscolhidos(sessao.id),
  ]);

  // Rascunho, ou aberta sem foto nenhuma: o cliente não pode cair numa grade
  // vazia e achar que o link quebrou.
  if (sessao.status === "rascunho" || fotos.length === 0) {
    return (
      <Moldura titulo={sessao.titulo}>
        <p className="text-sm leading-relaxed text-tinta-2">
          Suas fotos ainda estão subindo. Volte daqui a pouco — o ZP Studio avisa
          quando estiverem prontas.
        </p>
      </Moldura>
    );
  }

  const travada = sessao.status !== "aberta";

  return (
    <Tela>
      {/* `trilha` é a perfuração 35mm presa ao scroll — ver `.trilha-filme`
          em globals.css. Fica atrás de `@supports (animation-timeline:
          scroll())`: onde não há suporte, a faixa simplesmente não anima —
          zero JavaScript, roda no compositor. */}
      <main className="trilha-filme relative mx-auto w-full max-w-7xl px-4 py-bloco sm:px-6 lg:pl-12">
        <header className="mb-bloco">
          {/* O botão de tema mora aqui e não na barra de seleção de propósito: a
              barra é onde o cliente decide sobre as fotos, e enfiar uma opção de
              configuração no meio de 400 decisões é ruído. Aqui em cima ele é
              achado quando procurado e esquecido quando não. */}
          <div className="flex items-start justify-between gap-4">
            <h1 className="font-display text-secao uppercase tracking-cine">
              {sessao.titulo}
            </h1>
            <BotaoTema className="-mr-2 shrink-0" />
          </div>

          {travada ? (
            <p className="mt-3 max-w-xl border-l-2 border-linha-forte pl-4 text-corpo text-tinta-2">
              {sessao.status === "finalizada" || sessao.status === "arquivada"
                ? "Sua seleção já foi enviada para o ZP Studio. As fotos continuam aqui para consulta."
                : `O prazo para escolher venceu em ${formatarData(sessao.prazo_em)}. Fale com o ZP Studio para reabrir.`}
            </p>
          ) : (
            <p className="mt-3 max-w-xl text-corpo text-tinta-2">
              Escolha as fotos que você quer receber tratadas. Cada escolha salva
              sozinha — pode fechar e voltar depois.
            </p>
          )}

          <p className="mt-4 font-body text-hud font-medium text-tinta-3">
            {fotos.length} fotos · prazo {formatarData(sessao.prazo_em)}
          </p>
        </header>

        <GaleriaClient
          slug={slug}
          fotos={fotos}
          escolhidasIniciais={escolhidas}
          fotosIncluidas={sessao.fotos_incluidas}
          travada={travada}
        />
      </main>
    </Tela>
  );
}

function Moldura({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <Tela>
      <main className="mx-auto flex min-h-svh w-full max-w-xl flex-col justify-center gap-4 px-6 py-16">
        <h1 className="font-display text-secao uppercase tracking-cine">{titulo}</h1>
        {children}
      </main>
    </Tela>
  );
}
