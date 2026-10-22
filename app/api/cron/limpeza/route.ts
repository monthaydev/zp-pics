import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { emFatias, lerTudo } from "@/lib/paginar";
import { apagarObjetos } from "@/lib/r2";
import { criarClienteAdministrativo } from "@/lib/supabase/server";

/**
 * A limpeza diária. A Vercel chama esta rota uma vez por dia (`vercel.json`).
 *
 * Faz três coisas, e a terceira é um efeito colateral que o projeto quer:
 *
 * 1. **Expira as sessões** cujo prazo de escolha passou (`expirar_sessoes()`).
 *    A galeria já checa o prazo a cada leitura, então isto é conveniência do
 *    painel, mas é o que faz a lista refletir a realidade sem ninguém abrir a
 *    galeria.
 * 2. **Apaga do bucket as tratadas que não devem mais estar lá.** É a metade
 *    da exceção à Regra Número Um: a tratada sobe só para entrega e some
 *    sozinha. Sem esta rota, as tratadas ficariam pagas para sempre.
 * 3. **Mantém o Supabase acordado.** O plano grátis pausa o projeto depois de 7
 *    dias sem uso, e uma pausa com galeria de cliente aberta é cliente vendo
 *    erro. Uma consulta por dia evita isso (diagnóstico de 14/09, B1).
 *
 * O passo 2 parte das ENTREGAS, e não das sessões: partir das sessões vencidas
 * trazia, todo dia, toda sessão cuja entrega já venceu alguma vez — e passando
 * de 1.000 o Supabase cortava em silêncio, sem ordem, deixando as de trás sem
 * limpar nunca. Aqui lê-se só o que ainda está no bucket, paginado.
 *
 * Uma entrega está vencida quando:
 *   · a sessão tem prazo (`entrega_expira_em`) e ele passou — EXCETO se o
 *     arquivo foi reenviado DEPOIS do prazo: quem reenvia e ainda não estendeu
 *     o prazo tem {@link CARENCIA} dias para fazer isso antes de o cron apagar
 *     o reenvio; ou
 *   · a sessão NUNCA concluiu a entrega (sem prazo) e o arquivo está lá há mais
 *     de {@link CARENCIA} dias. É a ZP que subiu tratadas e arquivou, ou
 *     esqueceu de clicar em "Concluir": sem esta regra o "some em 30 dias" da
 *     exceção à Regra Número Um não valia para elas.
 *
 * Protegida por `CRON_SECRET`: a Vercel manda `Authorization: Bearer <segredo>`
 * sozinha quando a variável existe. Sem o segredo configurado a rota recusa
 * tudo, em vez de ficar aberta para qualquer um apagar entregas.
 */
export const maxDuration = 120;

const DIA = 86_400_000;
const CARENCIA = 14;

function autorizado(requisicao: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return false;
  const esperado = Buffer.from(`Bearer ${segredo}`);
  const recebido = Buffer.from(requisicao.headers.get("authorization") ?? "");
  // Comparação em tempo constante, e de tamanhos iguais: `timingSafeEqual`
  // lança se os buffers diferem no comprimento.
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

export async function GET(requisicao: Request) {
  if (!autorizado(requisicao)) return new NextResponse(null, { status: 401 });

  const supabase = criarClienteAdministrativo();
  const agora = Date.now();

  const { data: expiradas, error: erroExpirar } = await supabase.rpc("expirar_sessoes");

  let ativas: { id: string; sessao_id: string; key_arquivo: string; key_miniatura: string | null; enviado_em: string }[] = [];
  let erroLeitura = false;
  try {
    ativas = await lerTudo((de, ate) =>
      supabase
        .from("entregas")
        .select("id, sessao_id, key_arquivo, key_miniatura, enviado_em")
        .is("excluida_em", null)
        .order("id", { ascending: true })
        .range(de, ate),
    );
  } catch {
    erroLeitura = true;
  }

  // O prazo de cada sessão que tem entrega no bucket.
  const prazos = new Map<string, number | null>();
  for (const fatia of emFatias([...new Set(ativas.map((e) => e.sessao_id))])) {
    const { data } = await supabase.from("sessoes").select("id, entrega_expira_em").in("id", fatia);
    for (const s of data ?? []) {
      prazos.set(s.id as string, s.entrega_expira_em ? new Date(s.entrega_expira_em as string).getTime() : null);
    }
  }

  const vencidas = ativas.filter((e) => {
    const enviado = new Date(e.enviado_em).getTime();
    const prazo = prazos.get(e.sessao_id) ?? null;
    if (prazo === null) return enviado < agora - CARENCIA * DIA; // nunca concluída
    if (prazo > agora) return false; // ainda vale
    return enviado <= prazo || enviado < agora - CARENCIA * DIA; // reenviada depois do prazo: carência
  });

  let apagadas = 0;
  let falhas = 0;

  if (vencidas.length > 0) {
    const chaves = vencidas.flatMap((e) =>
      [e.key_arquivo, e.key_miniatura].filter((k): k is string => !!k),
    );
    const noBucket = new Set(await apagarObjetos(chaves));

    // Só marca como apagada a entrega que saiu inteira do bucket. A que falhou
    // fica sem marca e entra de novo na próxima rodada.
    const saiu: string[] = [];
    for (const e of vencidas) {
      const ok = !noBucket.has(e.key_arquivo) && !(e.key_miniatura && noBucket.has(e.key_miniatura));
      if (ok) saiu.push(e.id);
      else falhas += 1;
    }
    const marca = new Date().toISOString();
    for (const fatia of emFatias(saiu)) {
      const { error } = await supabase.from("entregas").update({ excluida_em: marca }).in("id", fatia);
      if (!error) apagadas += fatia.length;
      else falhas += fatia.length;
    }
  }

  return NextResponse.json({
    ok: !erroExpirar && !erroLeitura && falhas === 0,
    sessoesExpiradas: typeof expiradas === "number" ? expiradas : 0,
    entregasApagadas: apagadas,
    falhas,
  });
}
