import "server-only";

import { ordenarNomesEscolhidos, SELECAO_COM_NOME } from "@/lib/fotos";
import { lerTudo } from "@/lib/paginar";
import type { StatusSessao } from "@/lib/schemas";
import { criarClienteAdministrativo } from "@/lib/supabase/server";

/**
 * Tudo que o lado do cliente do ensaio lê e escreve.
 *
 * Usa o cliente `service_role`, que ignora a RLS — e é justamente por isso que
 * cada função daqui só roda depois que o cookie assinado foi conferido. A RLS
 * nega tudo para `anon` de propósito: o cliente do ensaio não fala com o
 * Supabase, fala com Server Actions.
 */

export type SessaoDoCliente = {
  id: string;
  slug: string;
  titulo: string;
  cliente_nome: string;
  fotos_incluidas: number;
  prazo_em: string;
  status: StatusSessao;
  finalizada_em: string | null;
  /** Só existe depois que a ZP entrega as tratadas. */
  entregue_em: string | null;
  entrega_expira_em: string | null;
};

/** Só para a verificação de senha. Nunca devolva isto a um componente client. */
type LinhaComSegredo = SessaoDoCliente & {
  senha_hash: string;
  tentativas_senha: number;
  bloqueado_ate: string | null;
};

const CAMPOS_PUBLICOS =
  "id, slug, titulo, cliente_nome, fotos_incluidas, prazo_em, status, finalizada_em, entregue_em, entrega_expira_em";

/**
 * Fecha a sessão cujo prazo passou, na hora da leitura.
 *
 * O `expirar_sessoes()` do banco pode ser agendado, mas confiar só nele deixaria
 * a galeria aberta em silêncio se o cron falhasse. Aqui a verificação acontece
 * em todo acesso — o banco é atualizado por conveniência do painel, mas quem
 * manda na tela é o valor devolvido.
 */
async function normalizarExpiracao<T extends { id: string; status: StatusSessao; prazo_em: string }>(
  sessao: T,
): Promise<T> {
  if (sessao.status !== "aberta") return sessao;
  if (new Date(sessao.prazo_em).getTime() > Date.now()) return sessao;

  const supabase = criarClienteAdministrativo();
  await supabase
    .from("sessoes")
    .update({ status: "expirada" })
    .eq("id", sessao.id)
    .eq("status", "aberta");

  return { ...sessao, status: "expirada" as StatusSessao };
}

export async function obterSessaoPorSlug(slug: string): Promise<SessaoDoCliente | null> {
  const supabase = criarClienteAdministrativo();
  const { data, error } = await supabase
    .from("sessoes")
    .select(CAMPOS_PUBLICOS)
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error(`Falha ao carregar a sessão: ${error.message}`);
  if (!data) return null;

  return normalizarExpiracao(data as unknown as SessaoDoCliente);
}

/** Idem, com o hash e o estado do rate limit. Só a action da senha usa. */
export async function obterSessaoParaSenha(slug: string): Promise<LinhaComSegredo | null> {
  const supabase = criarClienteAdministrativo();
  const { data, error } = await supabase
    .from("sessoes")
    .select(`${CAMPOS_PUBLICOS}, senha_hash, tentativas_senha, bloqueado_ate`)
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error(`Falha ao carregar a sessão: ${error.message}`);
  if (!data) return null;

  return normalizarExpiracao(data as unknown as LinhaComSegredo);
}

/**
 * Rate limit da senha — contado na própria sessão.
 *
 * Não é proteção contra força bruta de verdade (quem defende isso é a entropia
 * do slug); é o que impede alguém com o link em mãos de sair chutando senha
 * curta à vontade. Ao bater o limite, bloqueia por uns minutos e zera a
 * contagem, senão a partir da quinta tentativa toda tentativa nova bloquearia.
 */
export const LIMITE_TENTATIVAS = 5;
export const BLOQUEIO_MINUTOS = 10;

export async function registrarFalhaDeSenha(sessao: {
  id: string;
  tentativas_senha: number;
}): Promise<{ bloqueadoAte: Date | null }> {
  const tentativas = sessao.tentativas_senha + 1;
  const bloquear = tentativas >= LIMITE_TENTATIVAS;
  const bloqueadoAte = bloquear
    ? new Date(Date.now() + BLOQUEIO_MINUTOS * 60_000)
    : null;

  const supabase = criarClienteAdministrativo();
  await supabase
    .from("sessoes")
    .update({
      tentativas_senha: bloquear ? 0 : tentativas,
      ...(bloqueadoAte ? { bloqueado_ate: bloqueadoAte.toISOString() } : {}),
    })
    .eq("id", sessao.id);

  return { bloqueadoAte };
}

export async function limparTentativasDeSenha(sessaoId: string) {
  const supabase = criarClienteAdministrativo();
  await supabase
    .from("sessoes")
    .update({ tentativas_senha: 0, bloqueado_ate: null })
    .eq("id", sessaoId);
}

export type FotoDaGaleria = {
  id: string;
  nome_original: string;
  key_thumb: string;
  key_preview: string;
  largura: number;
  altura: number;
};

/**
 * As fotos que o cliente vê.
 *
 * Filtra `excluida_em`: depois que a sessão é finalizada, os derivativos das
 * não escolhidas não existem mais no bucket. Mostrar a linha renderizaria uma
 * grade de imagens quebradas.
 */
export async function listarFotosDaGaleria(sessaoId: string): Promise<FotoDaGaleria[]> {
  const supabase = criarClienteAdministrativo();
  // Paginado: ver `lib/paginar.ts`. `id` desempata a `ordem` — sem isso duas
  // páginas podiam repetir ou pular foto.
  const linhas = await lerTudo((de, ate) =>
    supabase
      .from("fotos")
      .select("id, nome_original, key_thumb, key_preview, largura, altura")
      .eq("sessao_id", sessaoId)
      .is("excluida_em", null)
      .order("ordem", { ascending: true })
      .order("id", { ascending: true })
      .range(de, ate),
  ).catch((e: Error) => {
    throw new Error(`Falha ao listar fotos: ${e.message}`);
  });
  return linhas as FotoDaGaleria[];
}

/**
 * Ids das fotos já escolhidas — é o que devolve a seleção ao recarregar a
 * página, e o que a finalização usa para decidir o que NÃO apagar. Por isso é
 * paginado: truncar aqui apagaria escolhidas.
 */
export async function idsEscolhidos(sessaoId: string): Promise<string[]> {
  const supabase = criarClienteAdministrativo();
  const linhas = await lerTudo((de, ate) =>
    supabase
      .from("selecoes")
      .select("foto_id")
      .eq("sessao_id", sessaoId)
      .order("foto_id", { ascending: true })
      .range(de, ate),
  ).catch((e: Error) => {
    throw new Error(`Falha ao carregar a seleção: ${e.message}`);
  });
  return linhas.map((linha) => linha.foto_id as string);
}

/**
 * Os nomes escolhidos, em ordem de ensaio — o que o cliente vê no resumo.
 *
 * Mesma transformação usada pelo painel (`lib/fotos.ts`), de propósito: as duas
 * telas mostram a mesma lista, e é a lista que a ZP cola no Lightroom.
 */
export async function nomesEscolhidos(sessaoId: string): Promise<string[]> {
  const supabase = criarClienteAdministrativo();
  const { data, error } = await supabase
    .from("selecoes")
    .select(SELECAO_COM_NOME)
    .eq("sessao_id", sessaoId);

  if (error) throw new Error(`Falha ao carregar a seleção: ${error.message}`);
  return ordenarNomesEscolhidos(data);
}

/**
 * As fotos escolhidas, com a miniatura — o que a tela de resumo mostra.
 *
 * Custa zero armazenamento a mais: estas são exatamente as fotos que **não**
 * foram apagadas do bucket ao finalizar. Antes o resumo entregava só uma lista
 * de nomes de arquivo, o que é o que a ZP precisa, mas não é o que o cliente
 * acabou de fazer — ele escolheu imagens, e a tela de recompensa mostrava
 * `_ZP4821.jpg`.
 *
 * O join sai desordenado do Postgres; a ordem do ensaio é reposta aqui, pela
 * mesma razão de sempre — a sequência das fotos é a sequência do ensaio.
 */
export async function fotosEscolhidas(sessaoId: string): Promise<FotoDaGaleria[]> {
  const supabase = criarClienteAdministrativo();
  const { data, error } = await supabase
    .from("selecoes")
    .select(
      "fotos!inner(id, nome_original, ordem, key_thumb, key_preview, largura, altura)",
    )
    .eq("sessao_id", sessaoId);

  if (error) throw new Error(`Falha ao carregar a seleção: ${error.message}`);

  const linhas = (data ?? []) as unknown as {
    fotos: FotoDaGaleria & { ordem: number };
  }[];

  return linhas
    .map((linha) => linha.fotos)
    .sort((a, b) => a.ordem - b.ordem);
}
