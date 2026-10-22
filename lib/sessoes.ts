import "server-only";

import bcrypt from "bcryptjs";
import { customAlphabet } from "nanoid";

import type { EntradaSessao } from "@/lib/schemas";
import type { StatusSessao } from "@/lib/schemas";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Alfabeto do slug: sem `0/O` e `1/l/I`, que se confundem quando o cliente lê o
 * link em voz alta no WhatsApp. 12 caracteres nesse alfabeto dão entropia de
 * sobra — e o slug é metade da credencial, então ele nunca é derivado do nome
 * do cliente nem sequencial.
 */
const gerarSlug = customAlphabet("23456789abcdefghijkmnpqrstuvwxyz", 12);

export type SessaoResumo = {
  id: string;
  slug: string;
  titulo: string;
  cliente_nome: string;
  cliente_email: string | null;
  cliente_whatsapp: string | null;
  fotos_incluidas: number;
  prazo_em: string;
  status: StatusSessao;
  finalizada_em: string | null;
  entregue_em: string | null;
  arquivada_em: string | null;
  /** Até quando o cliente baixa. Depois o cron apaga os arquivos do bucket. */
  entrega_expira_em: string | null;
  entrega_baixada_em: string | null;
  entrega_baixada_vezes: number;
  observacoes: string | null;
  created_at: string;
  total_fotos: number;
  total_escolhidas: number;
  total_extras: number;
  /** Não escolhidas, apagadas do bucket na finalização. Não têm volta. */
  total_apagadas: number;
  /** Tratadas entregues que ainda estão no bucket. */
  total_entregues: number;
};

/**
 * Lista para o painel.
 *
 * Lê a view `sessoes_resumo`, que já traz as contagens de foto e de escolhidas
 * — contar no cliente exigiria trazer as 400 linhas de cada sessão só pra somar.
 *
 * Usa o cliente autenticado (não o `service_role`): a RLS libera tudo para
 * `authenticated`, então o próprio login já é a autorização.
 */
export async function listarSessoes(): Promise<SessaoResumo[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("sessoes_resumo")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Falha ao listar sessões: ${error.message}`);
  return (data ?? []) as SessaoResumo[];
}

export async function obterSessao(id: string): Promise<SessaoResumo | null> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("sessoes_resumo")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Falha ao carregar a sessão: ${error.message}`);
  return (data as SessaoResumo | null) ?? null;
}

/**
 * Cria a sessão e devolve o id.
 *
 * Nasce como `rascunho`: só vira `aberta` quando as fotos já subiram. Mandar o
 * link antes disso mostraria uma galeria vazia pro cliente.
 */
export async function criarSessao(entrada: EntradaSessao): Promise<string> {
  const supabase = await criarClienteServidor();

  const prazo = new Date();
  prazo.setDate(prazo.getDate() + entrada.prazo_dias);

  // Curta e ditável no WhatsApp, mas guardada com hash: se o banco vazar, a
  // senha de cada ensaio não vaza junto.
  const senha_hash = await bcrypt.hash(entrada.senha, 10);

  const { data, error } = await supabase
    .from("sessoes")
    .insert({
      slug: gerarSlug(),
      titulo: entrada.titulo,
      cliente_nome: entrada.cliente_nome,
      cliente_email: entrada.cliente_email || null,
      cliente_whatsapp: entrada.cliente_whatsapp || null,
      senha_hash,
      fotos_incluidas: entrada.fotos_incluidas,
      prazo_em: prazo.toISOString(),
      status: "rascunho",
      observacoes: entrada.observacoes || null,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Falha ao criar a sessão: ${error.message}`);
  return data.id as string;
}
