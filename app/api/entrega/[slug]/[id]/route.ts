import { NextResponse } from "next/server";
import { z } from "zod";

import { obterEntregaDoCliente, registrarDownload } from "@/lib/entregas";
import { estadoDaEntrega } from "@/lib/entrega-cliente";
import { obterObjeto, tamanhoDoObjeto, urlDeDownload } from "@/lib/r2";

/**
 * Uma foto tratada, ou a miniatura dela, para o cliente.
 *
 * O arquivo sai byte a byte como a ZP exportou: sem reprocessar, sem reduzir,
 * sem marca d'água. É o que o cliente pagou, e a razão de a entrega existir.
 *
 * - `?miniatura=1`: a miniatura da grade, em stream pela nossa rota (é pequena
 *   e cacheável), como as miniaturas da galeria.
 * - sem isso: o arquivo inteiro. O crachá é conferido aqui e o navegador é
 *   REDIRECIONADO para uma URL assinada do R2 de 5 minutos, e baixa direto de
 *   lá. Passar um TIFF de 300 MB pela função da Vercel esbarraria no teto de
 *   duração (cortaria aos 300 s, e sem `Range` o download recomeçaria do zero),
 *   e gastaria a banda da Vercel. Do R2 não há teto, o `Range` retoma, e a
 *   saída é grátis.
 *
 * Sempre 404, nunca 403: um 403 confirmaria que o ensaio existe.
 */
export async function GET(requisicao: Request, ctx: RouteContext<"/api/entrega/[slug]/[id]">) {
  const { slug, id } = await ctx.params;

  // Um id que não é uuid faria o Postgres lançar "invalid input syntax" e a
  // rota responder 500 — que também diz ao curioso que o ensaio existe.
  if (!z.uuid().safeParse(id).success) return naoEncontrado();

  try {
    const estado = await estadoDaEntrega(slug);
    if (!estado || estado.tipo !== "ok") return naoEncontrado();

    const entrega = await obterEntregaDoCliente(estado.sessao.id, id);
    if (!entrega) return naoEncontrado();

    const miniatura = new URL(requisicao.url).searchParams.get("miniatura") === "1";

    if (miniatura) {
      if (!entrega.key_miniatura) return naoEncontrado();
      const objeto = await obterObjeto(entrega.key_miniatura, requisicao.headers.get("if-none-match"));
      if (objeto.naoModificado) {
        return new NextResponse(null, { status: 304, headers: { "Cache-Control": "private, max-age=3600" } });
      }
      if (!objeto.corpo) return naoEncontrado();
      return new NextResponse(objeto.corpo, {
        headers: {
          "Content-Type": objeto.tipo,
          ...(objeto.tamanho ? { "Content-Length": String(objeto.tamanho) } : {}),
          ...(objeto.etag ? { ETag: objeto.etag } : {}),
          // A chave da miniatura carrega o id da entrega e ela nunca é
          // reescrita; `private` porque é foto de cliente.
          "Cache-Control": "private, max-age=86400",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    // Confere que o arquivo existe e tem o tamanho que o banco conhece ANTES de
    // contar o download: redirecionar para um objeto que sumiu daria ao cliente
    // um erro do R2, e ao painel um "baixou" que não aconteceu.
    const tamanho = await tamanhoDoObjeto(entrega.key_arquivo);
    if (tamanho !== entrega.tamanho_bytes) return naoEncontrado();

    await registrarDownload(estado.sessao.id).catch(() => {});

    return new NextResponse(null, {
      status: 302,
      headers: {
        Location: await urlDeDownload(entrega.key_arquivo, entrega.nome_arquivo),
        // A URL assinada é de uso único na prática e curta; nenhum cache guarda.
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch {
    return naoEncontrado();
  }
}

/**
 * HEAD existe só para não contar download. Sem este handler o Next responde um
 * HEAD com o mesmo código do GET — e a ZP testando o link, ou um verificador de
 * links do WhatsApp, apareceria no painel como "o cliente baixou".
 */
export async function HEAD(_requisicao: Request, ctx: RouteContext<"/api/entrega/[slug]/[id]">) {
  const { slug, id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return naoEncontrado();
  try {
    const estado = await estadoDaEntrega(slug);
    if (!estado || estado.tipo !== "ok") return naoEncontrado();
    const entrega = await obterEntregaDoCliente(estado.sessao.id, id);
    return entrega ? new NextResponse(null, { status: 200 }) : naoEncontrado();
  } catch {
    return naoEncontrado();
  }
}

function naoEncontrado() {
  return new NextResponse(null, { status: 404 });
}
