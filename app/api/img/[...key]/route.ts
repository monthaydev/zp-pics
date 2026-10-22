import { NextResponse } from "next/server";

import { obterAdmin } from "@/lib/auth";
import { obterObjeto, sessaoDaChave } from "@/lib/r2";
import { temCrachaDaSessao } from "@/lib/sessao-cliente";

/**
 * A única porta para as imagens.
 *
 * O bucket R2 é privado e não existe URL pública nem URL assinada de longa
 * duração: toda miniatura e toda prévia sai por aqui, depois de conferir o
 * crachá da sessão. É o que impede que um link vazado no WhatsApp continue
 * servindo as fotos de um ensaio alheio.
 *
 * Custo: o egress do R2 é zero, mas a requisição passa pela Vercel. Por isso a
 * resposta é cacheável no navegador — as 400 miniaturas de um ensaio não podem
 * bater no servidor a cada scroll.
 */
export async function GET(requisicao: Request, ctx: RouteContext<"/api/img/[...key]">) {
  const { key } = await ctx.params;
  const chave = key.join("/");

  const sessaoId = sessaoDaChave(chave);
  // 404 e não 400: a forma da chave também não é assunto de quem não tem acesso.
  if (!sessaoId) return naoEncontrado();

  const liberado = (await temCrachaDaSessao(sessaoId)) || (await obterAdmin()) !== null;
  // Sempre 404, nunca 403. Um 403 confirmaria que o objeto existe — e a chave
  // carrega o id da sessão, então isso entregaria quais sessões são reais.
  if (!liberado) return naoEncontrado();

  // `private`: é foto de cliente, nenhum cache compartilhado pode guardar.
  // `immutable` porque a chave contém o id da foto e o derivativo nunca é
  // reescrito — quando a foto muda, muda a chave.
  const cache = {
    "Cache-Control": "private, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  };

  try {
    const objeto = await obterObjeto(chave, requisicao.headers.get("if-none-match"));

    // O navegador já tem esta imagem. Responder 304 sem corpo é o que impede
    // que uma recarga da galeria rebaixe as 400 miniaturas inteiras — e o
    // `immutable` não cobre isso sozinho, porque parte dos navegadores
    // revalida assim mesmo ao recarregar a página.
    if (objeto.naoModificado) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ...cache,
          // O ETag volta no 304 porque o navegador reaproveita ele na próxima
          // revalidação; omitir faria a entrada de cache perder a validação.
          ...(requisicao.headers.get("if-none-match")
            ? { ETag: requisicao.headers.get("if-none-match") as string }
            : {}),
        },
      });
    }

    if (!objeto.corpo) return naoEncontrado();

    return new NextResponse(objeto.corpo, {
      headers: {
        "Content-Type": objeto.tipo,
        ...(objeto.tamanho ? { "Content-Length": String(objeto.tamanho) } : {}),
        ...(objeto.etag ? { ETag: objeto.etag } : {}),
        ...cache,
      },
    });
  } catch {
    // Objeto ausente no bucket cai aqui (foto apagada na finalização, por
    // exemplo) e vira o mesmo 404 de sempre.
    return naoEncontrado();
  }
}

function naoEncontrado() {
  return new NextResponse(null, { status: 404 });
}
