import "server-only";

import { obterSessaoPorSlug, type SessaoDoCliente } from "@/lib/galeria";
import { lerCracha } from "@/lib/sessao-cliente";

/**
 * Quem pode ver a entrega, e em que estado ela está.
 *
 * A página e as duas rotas de download perguntam a mesma coisa, então a
 * resposta mora num lugar só — regras reimplementadas em separado são o jeito
 * de uma delas liberar o que a outra nega.
 *
 *   · `sem-cracha`   → ainda não digitou a senha deste ensaio
 *   · `nao-entregue` → a ZP não entregou (ainda, ou nunca: sessão arquivada
 *                      sem entrega)
 *   · `expirada`     → passou do prazo; o cron apaga os arquivos do bucket
 *   · `ok`           → pode ver e baixar
 *
 * `null` é "esse link não existe": a página responde 404, as rotas também —
 * nunca 403, que confirmaria que o ensaio é real.
 */
export type EstadoEntrega =
  | { tipo: "ok"; sessao: SessaoDoCliente }
  | { tipo: "sem-cracha"; sessao: SessaoDoCliente }
  | { tipo: "nao-entregue"; sessao: SessaoDoCliente }
  | { tipo: "expirada"; sessao: SessaoDoCliente };

export async function estadoDaEntrega(slug: string): Promise<EstadoEntrega | null> {
  const sessao = await obterSessaoPorSlug(slug);
  if (!sessao) return null;

  const cracha = await lerCracha(slug);
  if (!cracha || cracha.sessaoId !== sessao.id) return { tipo: "sem-cracha", sessao };

  // `arquivada` conta: a ZP pode ter arquivado a sessão depois de entregar, e o
  // cliente continua com direito aos arquivos até o prazo.
  const entregou = sessao.entregue_em !== null && sessao.entrega_expira_em !== null;
  if (!entregou || (sessao.status !== "entregue" && sessao.status !== "arquivada")) {
    return { tipo: "nao-entregue", sessao };
  }

  if (new Date(sessao.entrega_expira_em as string).getTime() <= Date.now()) {
    return { tipo: "expirada", sessao };
  }
  return { tipo: "ok", sessao };
}
