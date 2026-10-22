"use server";

import { revalidatePath } from "next/cache";

import { avisarSelecaoFinalizada } from "@/lib/email";
import { idsEscolhidos, obterSessaoPorSlug } from "@/lib/galeria";
import { emFatias, lerTudo } from "@/lib/paginar";
import { apagarObjetos } from "@/lib/r2";
import { esquemaAlternarSelecao, esquemaFinalizar } from "@/lib/schemas";
import { lerCracha } from "@/lib/sessao-cliente";
import { criarClienteAdministrativo } from "@/lib/supabase/server";

export type ResultadoSelecao = { ok: boolean; erro?: string };

/**
 * Marca ou desmarca fotos. Roda a cada clique — é o que faz a seleção salvar
 * sozinha, sem botão "salvar" e sem o cliente perder 40 minutos de trabalho se
 * o navegador fechar.
 *
 * Recebe uma lista: um clique é uma lista de um; um Shift+clique é a faixa
 * inteira numa ida só (ver `esquemaAlternarSelecao`). Tudo ou nada — se uma
 * foto da lista não é desta sessão, nada é gravado.
 *
 * Marcar é insert, desmarcar é delete. Nada de coluna booleana: o contador é um
 * `count(*)` e a lista final é um join.
 */
export async function alternarSelecao(entrada: unknown): Promise<ResultadoSelecao> {
  const analise = esquemaAlternarSelecao.safeParse(entrada);
  if (!analise.success) return { ok: false, erro: "Pedido inválido." };

  const { slug, escolhida } = analise.data;
  const ids = [...new Set(analise.data.foto_ids)];

  // Server Action é um POST que qualquer um pode disparar direto, sem passar
  // pela tela. Quem autoriza é o crachá — nunca o que veio no payload.
  const cracha = await lerCracha(slug);
  if (!cracha) return { ok: false, erro: "Sua sessão expirou. Recarregue a página." };

  const sessao = await obterSessaoPorSlug(slug);
  if (!sessao || sessao.id !== cracha.sessaoId) {
    return { ok: false, erro: "Sessão não encontrada." };
  }

  // Finalizada trava, expirada não aceita mais escolha. A tela já esconde o
  // botão nesses casos; esta é a trava de verdade.
  if (sessao.status !== "aberta") {
    return { ok: false, erro: "Esta seleção não está mais aberta." };
  }

  const supabase = criarClienteAdministrativo();

  // As fotos têm que ser desta sessão. Sem esta conferência, um `foto_id` de
  // outro ensaio entraria na seleção deste.
  // Em fatias: ver `emFatias` — uma faixa da primeira à última foto não cabe
  // numa URL só.
  let encontradas = 0;
  for (const fatia of emFatias(ids)) {
    const { data: fotos, error: erroFotos } = await supabase
      .from("fotos")
      .select("id")
      .in("id", fatia)
      .eq("sessao_id", sessao.id)
      .is("excluida_em", null);
    if (erroFotos) return { ok: false, erro: "Não deu pra salvar." };
    encontradas += (fotos ?? []).length;
  }
  if (encontradas !== ids.length) return { ok: false, erro: "Foto não encontrada." };

  if (escolhida) {
    // `upsert` com a chave única: clicar duas vezes rápido não pode virar erro.
    const { error } = await supabase
      .from("selecoes")
      .upsert(
        ids.map((foto_id) => ({ sessao_id: sessao.id, foto_id })),
        { onConflict: "sessao_id,foto_id", ignoreDuplicates: true },
      );
    if (error) return { ok: false, erro: "Não deu pra salvar." };
  } else {
    for (const fatia of emFatias(ids)) {
      const { error } = await supabase
        .from("selecoes")
        .delete()
        .eq("sessao_id", sessao.id)
        .in("foto_id", fatia);
      if (error) return { ok: false, erro: "Não deu pra salvar." };
    }
  }

  // Sem `revalidatePath`: a tela já se pintou sozinha no clique. Revalidar aqui
  // faria o servidor re-renderizar a grade inteira a cada foto marcada.
  return { ok: true };
}

/**
 * Fecha a seleção. **Esta ação não tem volta.**
 *
 * Trava a sessão e apaga do bucket os derivativos das fotos que o cliente não
 * escolheu — decisão de produto: o que não vai ser tratado não fica ocupando
 * espaço, e o custo do projeto continua plano por ensaio. A tela avisa disso
 * com todas as letras antes de chegar aqui.
 *
 * A ordem importa e é deliberada: **trava primeiro, apaga depois.** Se a
 * exclusão falhar no meio, sobra objeto no bucket (custa centavos) numa sessão
 * corretamente finalizada. Na ordem inversa, uma falha deixaria a sessão aberta
 * com as fotos já apagadas — o cliente voltaria pra uma galeria destruída.
 */
export async function finalizarSelecao(entrada: unknown): Promise<ResultadoSelecao> {
  const analise = esquemaFinalizar.safeParse(entrada);
  if (!analise.success) return { ok: false, erro: "Pedido inválido." };

  const { slug } = analise.data;

  const cracha = await lerCracha(slug);
  if (!cracha) return { ok: false, erro: "Sua sessão expirou. Recarregue a página." };

  const sessao = await obterSessaoPorSlug(slug);
  if (!sessao || sessao.id !== cracha.sessaoId) {
    return { ok: false, erro: "Sessão não encontrada." };
  }
  if (sessao.status !== "aberta") {
    return { ok: false, erro: "Esta seleção não está mais aberta." };
  }

  const escolhidos = await idsEscolhidos(sessao.id);
  // Trava de segurança: finalizar sem nenhuma escolha apagaria o ensaio inteiro,
  // e isso é engano em praticamente 100% dos casos.
  if (escolhidos.length === 0) {
    return { ok: false, erro: "Escolha pelo menos uma foto antes de finalizar." };
  }

  // A tela e o banco têm que concordar ANTES do passo que não volta. Eles
  // divergem quando uma marcação se perdeu na rede sem resposta (a tela não
  // sabe se salvou) ou quando outra aba mexeu na seleção. O cliente confirmou
  // "apagar N fotos" olhando a tela; se o banco diz outra coisa, a confirmação
  // dele não vale para o que seria apagado.
  if (escolhidos.length !== analise.data.escolhidas_esperadas) {
    return {
      ok: false,
      erro: "Sua seleção mudou desde que você abriu a página. Recarregue e confira antes de finalizar.",
    };
  }

  const supabase = criarClienteAdministrativo();

  // O `.eq("status", "aberta")` é o que faz isto ser seguro contra dois cliques:
  // a segunda chamada não afeta linha nenhuma e sai sem apagar nada de novo.
  const { data: travada, error: erroTrava } = await supabase
    .from("sessoes")
    .update({ status: "finalizada", finalizada_em: new Date().toISOString() })
    .eq("id", sessao.id)
    .eq("status", "aberta")
    .select("id");

  if (erroTrava) return { ok: false, erro: "Não deu pra finalizar. Tente de novo." };
  if (!travada?.length) return { ok: true };

  // Daqui pra baixo a sessão JÁ está finalizada. Nada pode lançar: um erro aqui
  // mostraria "não deu" ao cliente sobre uma seleção que deu, e o e-mail pra ZP
  // nunca sairia.

  // Janela para as marcações que já estavam a caminho. `alternarSelecao` confere
  // "aberta" e só depois grava — uma chamada que conferiu antes da trava pode
  // gravar depois dela. Uma ida dessas leva ~300 ms; 1,5 s cobre com folga.
  // É mitigação, não garantia: a garantia exige trava no Postgres (`for share`
  // numa função do banco), que é mudança de schema — registrada para o João.
  await new Promise((r) => setTimeout(r, 1500));

  // Relê as escolhidas DEPOIS da trava e da janela. E não apaga nada que
  // apareceu escolhido em QUALQUER das duas leituras: se outra aba desmarcou
  // a última foto no meio do caminho, a releitura viria vazia e — sem a união
  // — o ensaio inteiro sairia do bucket, furando a regra "zero escolhas é
  // recusado". Sobrar uma foto custa centavos; apagar uma escolhida não volta.
  const finais = await idsEscolhidos(sessao.id).catch(() => escolhidos);
  const protegidas = new Set([...escolhidos, ...finais]);

  // Paginado pelo mesmo motivo de `idsEscolhidos`. Se a leitura falhar, não
  // apaga nada: a sessão fica finalizada com todas as fotos, e o João vê.
  const todas = await lerTudo((de, ate) =>
    supabase
      .from("fotos")
      .select("id, key_thumb, key_preview")
      .eq("sessao_id", sessao.id)
      .is("excluida_em", null)
      .order("id", { ascending: true })
      .range(de, ate),
  ).catch(() => []);

  const descartadas = todas.filter((foto) => !protegidas.has(foto.id as string));
  let apagadas = 0;

  if (descartadas.length > 0) {
    const falhas = new Set(
      await apagarObjetos(
        descartadas.flatMap((foto) => [foto.key_thumb as string, foto.key_preview as string]),
      ),
    );
    // Só marca como excluída a foto que saiu inteira do bucket. A que falhou
    // continua visível na galeria finalizada e no painel, sem `excluida_em` —
    // nenhum script a recolhe sozinho (o `limpar-orfaos.mjs` procura objeto
    // SEM linha, e esta tem linha). Nova tentativa: reabrir e finalizar de novo.
    const saiu = descartadas
      .filter((foto) => !falhas.has(foto.key_thumb as string) && !falhas.has(foto.key_preview as string))
      .map((foto) => foto.id as string);
    const agora = new Date().toISOString();
    for (const fatia of emFatias(saiu)) {
      const { error } = await supabase.from("fotos").update({ excluida_em: agora }).in("id", fatia);
      if (!error) apagadas += fatia.length;
    }
  }

  await avisarSelecaoFinalizada({
    titulo: sessao.titulo,
    clienteNome: sessao.cliente_nome,
    escolhidas: finais.length,
    incluidas: sessao.fotos_incluidas,
    apagadas,
    sessaoId: sessao.id,
  }).catch(() => {
    // E-mail nunca derruba a finalização. O painel mostra a sessão finalizada
    // de qualquer jeito.
  });

  revalidatePath(`/s/${slug}`);
  revalidatePath(`/admin/sessoes/${sessao.id}`);
  revalidatePath("/admin");

  return { ok: true };
}
