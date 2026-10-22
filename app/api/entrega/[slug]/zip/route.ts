import { downloadZip } from "client-zip";
import { NextResponse } from "next/server";

import { dispositivoDeAnexo } from "@/lib/anexo";
import { dividirEmPartes } from "@/lib/entrega-partes";
import { listarEntregasDoCliente, registrarDownload } from "@/lib/entregas";
import { estadoDaEntrega } from "@/lib/entrega-cliente";
import { obterObjeto, tamanhoDoObjeto } from "@/lib/r2";

/**
 * As tratadas num .zip, montado em streaming, em partes.
 *
 * Streaming porque o conjunto passa de centenas de MB: montar em memória
 * estoura a função. Cada arquivo vem do bucket e vai direto para o zip, sem
 * ficar guardado.
 *
 * **Sem compressão.** JPEG já é comprimido; comprimir de novo gasta CPU e não
 * encolhe nada — e o conteúdo de cada arquivo dentro do zip é idêntico, byte a
 * byte, ao que a ZP exportou. O `client-zip` guarda sem compressão por
 * natureza.
 *
 * **Em partes** (`?parte=2`, ver `lib/entrega-partes.ts`): a função tem teto de
 * duração, e uma entrega grande num zip só seria cortada sempre no mesmo ponto.
 *
 * O tamanho do zip é previsto antes (`metadata`), então o navegador mostra
 * progresso de verdade. Por isso, ANTES de abrir o stream, cada arquivo da
 * parte é conferido no bucket contra o tamanho do banco: se um sumiu, a
 * resposta é um 404 limpo — e não um zip cortado no meio, com status 200 e o
 * download já contado.
 */
export const maxDuration = 300;

export async function GET(requisicao: Request, ctx: RouteContext<"/api/entrega/[slug]/zip">) {
  const { slug } = await ctx.params;

  const estado = await estadoDaEntrega(slug);
  if (!estado || estado.tipo !== "ok") return new NextResponse(null, { status: 404 });

  const todas = await listarEntregasDoCliente(estado.sessao.id);
  const partes = dividirEmPartes(todas);
  if (partes.length === 0) return new NextResponse(null, { status: 404 });

  const pedida = Number(new URL(requisicao.url).searchParams.get("parte") ?? "1");
  if (!Number.isInteger(pedida) || pedida < 1 || pedida > partes.length) {
    return new NextResponse(null, { status: 404 });
  }
  const entregas = partes[pedida - 1];

  const confere = await Promise.all(
    entregas.map(async (e) => (await tamanhoDoObjeto(e.key_arquivo).catch(() => null)) === e.tamanho_bytes),
  );
  if (confere.some((ok) => !ok)) return new NextResponse(null, { status: 404 });

  await registrarDownload(estado.sessao.id).catch(() => {});

  async function* arquivos() {
    for (const e of entregas) {
      const objeto = await obterObjeto(e.key_arquivo);
      if (objeto.naoModificado || !objeto.corpo) throw new Error(`Arquivo ausente: ${e.nome_arquivo}`);
      yield {
        name: e.nome_arquivo,
        size: e.tamanho_bytes,
        lastModified: new Date(e.enviado_em),
        input: objeto.corpo as unknown as AsyncIterable<Uint8Array>,
      };
    }
  }

  const resposta = downloadZip(arquivos(), {
    metadata: entregas.map((e) => ({ name: e.nome_arquivo, size: e.tamanho_bytes })),
  });

  const nome = estado.sessao.titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const sufixo = partes.length > 1 ? `-parte-${pedida}-de-${partes.length}` : "";

  const tamanho = resposta.headers.get("Content-Length");
  return new NextResponse(resposta.body, {
    headers: {
      "Content-Type": "application/zip",
      ...(tamanho ? { "Content-Length": tamanho } : {}),
      "Content-Disposition": dispositivoDeAnexo(`${nome || "fotos"}-tratadas${sufixo}.zip`),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
