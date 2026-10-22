import "server-only";

import { criarClienteAdministrativo, criarClienteServidor } from "@/lib/supabase/server";

/**
 * A entrega das fotos tratadas: leitura.
 *
 * Duas portas, como no resto do projeto: o painel lê com o cliente autenticado
 * (a RLS libera o admin), a página do cliente lê com a `service_role` depois
 * de conferir o crachá — o cliente nunca fala com o Supabase.
 */

export type Entrega = {
  id: string;
  sessao_id: string;
  nome_arquivo: string;
  tamanho_bytes: number;
  key_arquivo: string;
  key_miniatura: string | null;
  largura: number | null;
  altura: number | null;
  enviado_em: string;
  excluida_em: string | null;
};

const CAMPOS =
  "id, sessao_id, nome_arquivo, tamanho_bytes, key_arquivo, key_miniatura, largura, altura, enviado_em, excluida_em";

/** Para o painel. Inclui as já apagadas pelo prazo: o admin vê o que foi entregue. */
export async function listarEntregasDoPainel(sessaoId: string): Promise<Entrega[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("entregas")
    .select(CAMPOS)
    .eq("sessao_id", sessaoId)
    .order("nome_arquivo", { ascending: true });
  if (error) throw new Error(`Falha ao listar a entrega: ${error.message}`);
  return (data ?? []) as Entrega[];
}

/** Para o cliente: só o que ainda está no bucket. */
export async function listarEntregasDoCliente(sessaoId: string): Promise<Entrega[]> {
  const supabase = criarClienteAdministrativo();
  const { data, error } = await supabase
    .from("entregas")
    .select(CAMPOS)
    .eq("sessao_id", sessaoId)
    .is("excluida_em", null)
    .order("nome_arquivo", { ascending: true });
  if (error) throw new Error(`Falha ao listar a entrega: ${error.message}`);
  return (data ?? []) as Entrega[];
}

export async function obterEntregaDoCliente(
  sessaoId: string,
  entregaId: string,
): Promise<Entrega | null> {
  const supabase = criarClienteAdministrativo();
  const { data, error } = await supabase
    .from("entregas")
    .select(CAMPOS)
    .eq("sessao_id", sessaoId)
    .eq("id", entregaId)
    .is("excluida_em", null)
    .maybeSingle();
  if (error) throw new Error(`Falha ao carregar o arquivo: ${error.message}`);
  return (data as Entrega | null) ?? null;
}

/**
 * Marca que o cliente baixou. Só o instante e a contagem — não guarda quem nem
 * de onde. É o "baixou em 23/10" do painel.
 *
 * Numa função do banco (`registrar_download`), e não em ler-somar-gravar: o zip
 * e os arquivos soltos podem ser baixados ao mesmo tempo, e duas leituras do
 * mesmo número gravariam o mesmo resultado, perdendo um incremento.
 */
export async function registrarDownload(sessaoId: string) {
  const supabase = criarClienteAdministrativo();
  await supabase.rpc("registrar_download", { p_sessao: sessaoId });
}
