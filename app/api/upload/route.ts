import { NextResponse } from "next/server";

import { obterAdmin } from "@/lib/auth";
import { chaveObjeto, urlDeUpload } from "@/lib/r2";
import { esquemaPedidoUpload } from "@/lib/schemas";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Emite URLs pré-assinadas para o navegador do admin subir os derivativos
 * direto no R2.
 *
 * Os arquivos não passam por aqui — subir 400 arquivos através da função
 * serverless custaria tempo e banda à toa, já que quem tem os bytes é a máquina
 * do admin. Este endpoint só assina.
 *
 * É rota autenticada: uma URL de PUT é permissão de escrita no bucket.
 */
export async function POST(requisicao: Request) {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  }

  let corpo: unknown;
  try {
    corpo = await requisicao.json();
  } catch {
    return NextResponse.json({ erro: "JSON inválido." }, { status: 400 });
  }

  const analise = esquemaPedidoUpload.safeParse(corpo);
  if (!analise.success) {
    return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  }

  const { sessao_id, ids } = analise.data;

  // A sessão precisa existir antes de assinarmos qualquer coisa: sem isto,
  // um id inventado viraria lixo permanente num prefixo órfão do bucket.
  const supabase = await criarClienteServidor();
  const { data: sessao, error } = await supabase
    .from("sessoes")
    .select("id, status")
    .eq("id", sessao_id)
    .maybeSingle();

  if (error || !sessao) {
    return NextResponse.json({ erro: "Sessão não encontrada." }, { status: 404 });
  }

  // Assinar upload pra uma sessão finalizada gravaria objetos que o banco já
  // considera apagados — órfãos por construção, e a finalização já jogou fora
  // as fotos não escolhidas dela.
  if (["finalizada", "entregue", "arquivada"].includes(sessao.status as string)) {
    return NextResponse.json({ erro: "Esta sessão já foi finalizada." }, { status: 409 });
  }

  const urls = await Promise.all(
    ids.map(async (fotoId) => ({
      foto_id: fotoId,
      thumb: await urlDeUpload(chaveObjeto(sessao_id, fotoId, "thumb")),
      preview: await urlDeUpload(chaveObjeto(sessao_id, fotoId, "preview")),
    })),
  );

  return NextResponse.json({ urls });
}
