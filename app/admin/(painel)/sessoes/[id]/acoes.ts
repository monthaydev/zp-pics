"use server";

import { revalidatePath } from "next/cache";

import { exigirAdmin } from "@/lib/auth";
import { apagarObjetos, chaveObjeto } from "@/lib/r2";
import { esquemaAbrirSessao, esquemaReabrir, esquemaRegistrarFotos } from "@/lib/schemas";
import { criarClienteServidor } from "@/lib/supabase/server";

export type ResultadoRegistro = { ok: boolean; erro?: string };

/**
 * Registra no banco as fotos cujos derivativos já subiram no R2.
 *
 * Roda por lote, não no fim de tudo: se a aba fechar no meio de um ensaio de
 * 400 fotos, o que já subiu está gravado e a retomada continua de onde parou.
 */
export async function registrarFotos(
  entrada: unknown,
): Promise<ResultadoRegistro> {
  await exigirAdmin();

  const analise = esquemaRegistrarFotos.safeParse(entrada);
  if (!analise.success) return { ok: false, erro: "Dados de foto inválidos." };

  const { sessao_id, fotos } = analise.data;
  const supabase = await criarClienteServidor();

  const linhas = fotos.map((f) => ({
    id: f.foto_id,
    sessao_id,
    // Intocado de ponta a ponta: é a única ligação com o RAW no HD da ZP.
    nome_original: f.nome_original,
    ordem: f.ordem,
    // As chaves são derivadas aqui, não aceitas do cliente — quem manda a chave
    // manda onde escrever no bucket.
    key_thumb: chaveObjeto(sessao_id, f.foto_id, "thumb"),
    key_preview: chaveObjeto(sessao_id, f.foto_id, "preview"),
    largura: f.largura,
    altura: f.altura,
  }));

  // `ignoreDuplicates` porque reenviar o mesmo arquivo numa retomada é normal,
  // e a chave única (sessao_id, nome_original) já garante que não duplica.
  const { data: inseridas, error } = await supabase
    .from("fotos")
    .upsert(linhas, { onConflict: "sessao_id,nome_original", ignoreDuplicates: true })
    .select("id");

  if (error) return { ok: false, erro: error.message };

  // O que o banco recusou por duplicidade JÁ SUBIU pro bucket sob um id novo
  // (o `foto_id` nasce no navegador, antes do upsert). Sem apagar aqui, esses
  // objetos ficam pagos e invisíveis pra sempre: a finalização só apaga
  // chaves que existem em `fotos`, e uma chave recusada nunca entra lá.
  const aceitas = new Set((inseridas ?? []).map((l) => l.id as string));
  const recusadas = linhas.filter((l) => !aceitas.has(l.id));
  if (recusadas.length) {
    await apagarObjetos(recusadas.flatMap((l) => [l.key_thumb, l.key_preview]));
  }

  revalidatePath(`/admin/sessoes/${sessao_id}`);
  return { ok: true };
}

/** Abre a sessão pro cliente. Só depois disso o link mostra alguma coisa. */
export async function abrirSessao(entrada: unknown): Promise<ResultadoRegistro> {
  await exigirAdmin();

  // Era a única Server Action do projeto sem zod — só o admin chama, mas é um
  // POST como qualquer outro, e um id malformado ia direto pra query.
  const analise = esquemaAbrirSessao.safeParse(entrada);
  if (!analise.success) return { ok: false, erro: "Sessão inválida." };
  const sessaoId = analise.data.sessao_id;

  const supabase = await criarClienteServidor();

  const { count } = await supabase
    .from("fotos")
    .select("id", { count: "exact", head: true })
    .eq("sessao_id", sessaoId);

  if (!count) {
    return { ok: false, erro: "Suba as fotos antes de abrir a sessão." };
  }

  const { error } = await supabase
    .from("sessoes")
    .update({ status: "aberta" })
    .eq("id", sessaoId)
    .eq("status", "rascunho");

  if (error) return { ok: false, erro: error.message };

  revalidatePath(`/admin/sessoes/${sessaoId}`);
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Reabre uma sessão finalizada ou vencida, com prazo novo.
 *
 * **O que foi apagado não volta.** Se o cliente já finalizou, os derivativos das
 * fotos que ele não escolheu saíram do bucket — reabrir devolve o direito de
 * mexer na seleção, não as fotos. A tela avisa isso antes.
 *
 * Prazo novo é obrigatório: reabrir mantendo a data vencida faria a sessão
 * nascer expirada de novo na primeira leitura.
 */
export async function reabrirSessao(entrada: unknown): Promise<ResultadoRegistro> {
  await exigirAdmin();

  const analise = esquemaReabrir.safeParse(entrada);
  if (!analise.success) return { ok: false, erro: "Prazo inválido." };

  const { sessao_id, prazo_dias } = analise.data;

  const prazo = new Date();
  prazo.setDate(prazo.getDate() + prazo_dias);

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("sessoes")
    .update({
      status: "aberta",
      prazo_em: prazo.toISOString(),
      finalizada_em: null,
    })
    .eq("id", sessao_id)
    .in("status", ["finalizada", "expirada"]);

  if (error) return { ok: false, erro: error.message };

  revalidatePath(`/admin/sessoes/${sessao_id}`);
  revalidatePath("/admin");
  return { ok: true };
}
