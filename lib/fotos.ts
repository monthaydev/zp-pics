import "server-only";

import { lerTudo } from "@/lib/paginar";
import { criarClienteServidor } from "@/lib/supabase/server";

export type Foto = {
  id: string;
  sessao_id: string;
  nome_original: string;
  ordem: number;
  key_thumb: string;
  key_preview: string;
  largura: number;
  altura: number;
};

export async function listarFotos(sessaoId: string): Promise<Foto[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("fotos")
    .select("*")
    .eq("sessao_id", sessaoId)
    .order("ordem", { ascending: true });

  if (error) throw new Error(`Falha ao listar fotos: ${error.message}`);
  return (data ?? []) as Foto[];
}

/**
 * A entrega final para a ZP: os nomes escolhidos, na ordem do ensaio.
 *
 * É esta lista que vai colada no filtro do Lightroom. Sai daqui exatamente como
 * entrou no upload — sem trim, sem normalizar acento, sem mexer na caixa.
 */
export const SELECAO_COM_NOME = "fotos!inner(nome_original, ordem)";

/**
 * Transforma o resultado do join em lista de nomes ordenada pelo ensaio.
 *
 * Vive aqui sozinha porque as duas pontas do app precisam dela — o painel, com
 * o cliente autenticado, e a tela de resumo do cliente, com `service_role`. Se
 * cada uma tivesse a sua cópia, uma delas ia divergir um dia; e é exatamente
 * esta função que decide o conteúdo do arquivo que a ZP cola no Lightroom.
 */
export function ordenarNomesEscolhidos(dados: unknown): string[] {
  const linhas = (dados ?? []) as {
    fotos: { nome_original: string; ordem: number };
  }[];

  return linhas
    .map((linha) => linha.fotos)
    .sort((a, b) => a.ordem - b.ordem)
    .map((foto) => foto.nome_original);
}

export async function nomesEscolhidosDaSessao(sessaoId: string): Promise<string[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("selecoes")
    .select(SELECAO_COM_NOME)
    .eq("sessao_id", sessaoId);

  if (error) throw new Error(`Falha ao carregar a seleção: ${error.message}`);
  return ordenarNomesEscolhidos(data);
}

/**
 * As fotos que já subiram nesta sessão: nome e posição no ensaio.
 *
 * É o que permite retomar um upload interrompido: o navegador compara a pasta
 * escolhida com esta lista e reprocessa só o que falta. O banco é a fonte da
 * verdade — estado guardado no navegador some junto com a aba.
 *
 * A `ordem` vem junto porque a retomada precisa continuar a numeração de onde
 * a pasta parou, e uma pasta NOVA precisa começar depois da última — sem ela,
 * as fotos se intercalavam na galeria. Paginado: ver `lib/paginar.ts`.
 */
export type FotoEnviada = { nome: string; ordem: number };

export async function fotosJaEnviadas(sessaoId: string): Promise<FotoEnviada[]> {
  const supabase = await criarClienteServidor();
  const linhas = await lerTudo((de, ate) =>
    supabase
      .from("fotos")
      .select("nome_original, ordem")
      .eq("sessao_id", sessaoId)
      .order("ordem", { ascending: true })
      .order("id", { ascending: true })
      .range(de, ate),
  ).catch((e: Error) => {
    throw new Error(`Falha ao conferir fotos enviadas: ${e.message}`);
  });
  return linhas.map((f) => ({ nome: f.nome_original as string, ordem: f.ordem as number }));
}

/**
 * As primeiras miniaturas de cada sessão — a tira de contato do painel. Uma
 * consulta por sessão (não por foto): pedir só `key_thumb` com `LIMIT`, em
 * paralelo, transfere quase nada mesmo num ensaio de 400 fotos. Uma única
 * consulta `in (ids)` sem `LIMIT` por grupo traria as 400 linhas de cada
 * sessão só pra descartar a maioria.
 *
 * Busca 6 sempre — a tira pequena da lista usa 4, a grande da bancada usa 6 —
 * e cada tela corta o que não precisa. `excluida_em is null`: numa sessão
 * finalizada, as não escolhidas já saíram do bucket, e mostrar a miniatura
 * delas aqui devolveria 404.
 */
export async function primeirasFotosPorSessao(
  sessaoIds: string[],
): Promise<Map<string, string[]>> {
  if (sessaoIds.length === 0) return new Map();

  const supabase = await criarClienteServidor();
  const pares = await Promise.all(
    sessaoIds.map(async (id) => {
      const { data } = await supabase
        .from("fotos")
        .select("key_thumb")
        .eq("sessao_id", id)
        .is("excluida_em", null)
        .order("ordem", { ascending: true })
        .limit(6);
      return [id, (data ?? []).map((f) => f.key_thumb as string)] as const;
    }),
  );

  return new Map(pares);
}
