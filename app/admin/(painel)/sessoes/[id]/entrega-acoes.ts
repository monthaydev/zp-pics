"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { exigirAdmin } from "@/lib/auth";
import { chaveEntrega, apagarObjetos, listarChavesPorPrefixo, tamanhoDoObjeto, urlDeUpload } from "@/lib/r2";
import {
  esquemaAbrirSessao,
  esquemaContato,
  esquemaPedidoEntrega,
  esquemaPrazoEntrega,
  esquemaRegistrarEntrega,
  esquemaRemoverEntrega,
} from "@/lib/schemas";
import { criarClienteServidor } from "@/lib/supabase/server";

export type ResultadoEntrega = { ok: boolean; erro?: string };

/**
 * Tudo aqui é do admin: `exigirAdmin()` na primeira linha de cada action, antes
 * de qualquer leitura. Server Action é um POST que qualquer um pode disparar.
 */

function atualizarTelas(sessaoId: string) {
  revalidatePath(`/admin/sessoes/${sessaoId}`);
  revalidatePath("/admin");
}

async function statusDa(sessaoId: string) {
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("sessoes")
    .select("status")
    .eq("id", sessaoId)
    .maybeSingle();
  return (data?.status as string | undefined) ?? null;
}

// ── contato ──────────────────────────────────────────────────────────────────

/** Corrige e-mail e WhatsApp do cliente. Antes não dava: um dígito errado era sessão nova. */
export async function atualizarContato(entrada: unknown): Promise<ResultadoEntrega> {
  await exigirAdmin();
  const analise = esquemaContato.safeParse(entrada);
  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? "Contato inválido." };
  }
  const { sessao_id, cliente_email, cliente_whatsapp } = analise.data;

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("sessoes")
    .update({
      cliente_email: cliente_email || null,
      cliente_whatsapp: cliente_whatsapp || null,
    })
    .eq("id", sessao_id);
  if (error) return { ok: false, erro: "Não deu pra salvar o contato." };

  atualizarTelas(sessao_id);
  return { ok: true };
}

// ── arquivar ─────────────────────────────────────────────────────────────────

/**
 * Tira a sessão da frente sem apagar nada. Serve para "não vou enviar por
 * aqui" (a entrega foi por pendrive, WeTransfer, ou pessoalmente) e para
 * limpar uma sessão que acabou. Nunca apaga fotos nem entrega.
 */
export async function arquivarSessao(entrada: unknown): Promise<ResultadoEntrega> {
  await exigirAdmin();
  const analise = esquemaAbrirSessao.safeParse(entrada);
  if (!analise.success) return { ok: false, erro: "Sessão inválida." };
  const { sessao_id } = analise.data;

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("sessoes")
    .update({ status: "arquivada", arquivada_em: new Date().toISOString() })
    .eq("id", sessao_id)
    // Só o que já acabou ou venceu. Arquivar uma aberta esconderia da frente um
    // cliente que ainda está escolhendo.
    .in("status", ["finalizada", "entregue", "expirada"])
    .select("id");

  if (error) return { ok: false, erro: "Não deu pra arquivar." };
  if (!data?.length) return { ok: false, erro: "Só dá pra arquivar sessão finalizada, entregue ou vencida." };

  atualizarTelas(sessao_id);
  return { ok: true };
}

/**
 * Devolve a sessão ao estado em que estava: entregue se chegou a entregar,
 * finalizada se o cliente finalizou, vencida se nem isso.
 */
export async function desarquivarSessao(entrada: unknown): Promise<ResultadoEntrega> {
  await exigirAdmin();
  const analise = esquemaAbrirSessao.safeParse(entrada);
  if (!analise.success) return { ok: false, erro: "Sessão inválida." };
  const { sessao_id } = analise.data;

  const supabase = await criarClienteServidor();
  const { data: sessao } = await supabase
    .from("sessoes")
    .select("status, entregue_em, finalizada_em")
    .eq("id", sessao_id)
    .maybeSingle();
  if (!sessao || sessao.status !== "arquivada") return { ok: false, erro: "Esta sessão não está arquivada." };

  const volta = sessao.entregue_em ? "entregue" : sessao.finalizada_em ? "finalizada" : "expirada";
  const { error } = await supabase
    .from("sessoes")
    .update({ status: volta, arquivada_em: null })
    .eq("id", sessao_id)
    .eq("status", "arquivada");
  if (error) return { ok: false, erro: "Não deu pra desarquivar." };

  atualizarTelas(sessao_id);
  return { ok: true };
}

// ── subir as tratadas ────────────────────────────────────────────────────────

export type UrlEntrega = {
  nome: string;
  id: string;
  urlArquivo: string;
  /** Nula quando o navegador não gerou miniatura (TIFF). */
  urlMiniatura: string | null;
};

/**
 * URLs de PUT para as tratadas, direto para o R2.
 *
 * Direto do navegador por causa do tamanho: uma tratada de 20 MB passando pela
 * função da Vercel esbarra no teto de corpo de 4,5 MB. O servidor só assina.
 * Vida curta — o upload acontece agora.
 */
export async function pedirUrlsEntrega(
  entrada: unknown,
): Promise<ResultadoEntrega & { urls?: UrlEntrega[] }> {
  await exigirAdmin();
  const analise = esquemaPedidoEntrega.safeParse(entrada);
  if (!analise.success) return { ok: false, erro: "Arquivos inválidos para a entrega." };
  const { sessao_id, arquivos } = analise.data;

  // A entrega só abre depois da finalização. Subir tratada antes da seleção
  // seria entregar o que o cliente ainda nem escolheu.
  const status = await statusDa(sessao_id);
  if (status !== "finalizada" && status !== "entregue") {
    return { ok: false, erro: "A entrega só abre depois que o cliente finaliza a seleção." };
  }

  const supabase = await criarClienteServidor();
  const { data: existentes, error } = await supabase
    .from("entregas")
    .select("nome_arquivo")
    .eq("sessao_id", sessao_id)
    // Só as que ainda estão no ar. As que o cron já apagou (`excluida_em`) não
    // contam: sem esta linha, depois que a entrega vencia, nenhum nome podia
    // ser reenviado — "Já entregue" para um arquivo que nem existe mais.
    .is("excluida_em", null)
    .in(
      "nome_arquivo",
      arquivos.map((a) => a.nome),
    );
  if (error) return { ok: false, erro: "Não deu pra conferir o que já foi entregue." };
  if (existentes?.length) {
    return {
      ok: false,
      erro: `Já entregue: ${existentes.map((e) => e.nome_arquivo).join(", ")}. Remova antes de subir de novo.`,
    };
  }

  const urls = await Promise.all(
    arquivos.map(async (a) => {
      const id = randomUUID();
      return {
        nome: a.nome,
        id,
        // O tamanho entra na assinatura: o bucket recusa um PUT de outro
        // tamanho. 15 minutos bastam para um arquivo grande e encurtam a janela
        // em que a URL, já usada, ainda existe.
        urlArquivo: await urlDeUpload(chaveEntrega(sessao_id, id, "arquivo"), 60 * 15, a.tipo, a.tamanho),
        urlMiniatura: a.tamanhoMiniatura
          ? await urlDeUpload(
              chaveEntrega(sessao_id, id, "miniatura"),
              60 * 15,
              "image/webp",
              a.tamanhoMiniatura,
            )
          : null,
      };
    }),
  );
  return { ok: true, urls };
}

/**
 * Registra o que subiu — depois de conferir que chegou.
 *
 * URL assinada não garante que o PUT terminou. Antes de gravar a linha o
 * servidor pergunta ao bucket pelo tamanho: arquivo que chegou pela metade
 * entregaria uma foto cortada, e o cliente só veria na hora de abrir.
 */
export async function registrarEntrega(
  entrada: unknown,
): Promise<ResultadoEntrega & { registrados?: number; falhas?: string[] }> {
  await exigirAdmin();
  const analise = esquemaRegistrarEntrega.safeParse(entrada);
  if (!analise.success) return { ok: false, erro: "Dados da entrega inválidos." };
  const { sessao_id, itens } = analise.data;

  const status = await statusDa(sessao_id);
  if (status !== "finalizada" && status !== "entregue") {
    return { ok: false, erro: "A entrega só abre depois que o cliente finaliza a seleção." };
  }

  // Reenvio depois do prazo: a linha antiga (`excluida_em`, objeto já apagado
  // pelo cron) ocuparia o `unique (sessao_id, nome_arquivo)` e barraria o
  // insert. Ela só guarda o histórico de algo que não existe mais — sai.
  {
    const supabase = await criarClienteServidor();
    await supabase
      .from("entregas")
      .delete()
      .eq("sessao_id", sessao_id)
      .not("excluida_em", "is", null)
      .in(
        "nome_arquivo",
        itens.map((i) => i.nome),
      );
  }

  const boas: {
    id: string;
    sessao_id: string;
    nome_arquivo: string;
    tamanho_bytes: number;
    key_arquivo: string;
    key_miniatura: string | null;
    largura: number | null;
    altura: number | null;
  }[] = [];
  const falhas: string[] = [];
  const aLimpar: string[] = [];

  for (const item of itens) {
    const keyArquivo = chaveEntrega(sessao_id, item.id, "arquivo");
    const keyMiniatura = chaveEntrega(sessao_id, item.id, "miniatura");

    const bytes = await tamanhoDoObjeto(keyArquivo);
    const miniaturaChegou = item.temMiniatura ? (await tamanhoDoObjeto(keyMiniatura)) !== null : false;

    if (bytes !== item.tamanho) {
      falhas.push(item.nome);
      aLimpar.push(keyArquivo, keyMiniatura);
      continue;
    }
    // Miniatura que o navegador anunciou e não chegou: entrega o arquivo mesmo
    // assim, sem miniatura. A foto é o que importa.
    if (!miniaturaChegou) aLimpar.push(keyMiniatura);

    boas.push({
      id: item.id,
      sessao_id,
      nome_arquivo: item.nome,
      tamanho_bytes: item.tamanho,
      key_arquivo: keyArquivo,
      key_miniatura: miniaturaChegou ? keyMiniatura : null,
      largura: miniaturaChegou ? item.largura : null,
      altura: miniaturaChegou ? item.altura : null,
    });
  }

  if (boas.length > 0) {
    const supabase = await criarClienteServidor();
    const { error } = await supabase.from("entregas").insert(boas);
    if (error) {
      // Nada gravado agora: apaga o que subiu para não deixar objeto pago e
      // invisível — MENOS o que já tem linha. Se a action for chamada de novo
      // com os mesmos itens, o insert falha na chave primária, e apagar
      // tudo levaria embora arquivos já registrados e entregues.
      const { data: jaRegistradas } = await supabase
        .from("entregas")
        .select("id")
        .in(
          "id",
          boas.map((b) => b.id),
        );
      const vivas = new Set((jaRegistradas ?? []).map((r) => r.id as string));
      await apagarObjetos(
        boas
          .filter((b) => !vivas.has(b.id))
          .flatMap((b) => [b.key_arquivo, ...(b.key_miniatura ? [b.key_miniatura] : [])]),
      );
      return { ok: false, erro: "Não deu pra registrar a entrega. Tente de novo." };
    }
  }
  // Nunca apaga a chave de um item que acabou de entrar: ids e nomes são únicos
  // no pedido (zod), então não deveria acontecer — e se acontecer, o que
  // acabou de ser registrado não vai embora.
  const vivos = new Set(boas.flatMap((b) => [b.key_arquivo, ...(b.key_miniatura ? [b.key_miniatura] : [])]));
  const descartar = aLimpar.filter((k) => !vivos.has(k));
  if (descartar.length > 0) await apagarObjetos(descartar);

  atualizarTelas(sessao_id);
  return { ok: falhas.length === 0, registrados: boas.length, falhas, erro: falhas.length ? "Alguns arquivos não chegaram inteiros." : undefined };
}

/**
 * Fecha a entrega: a sessão vira `entregue` e o relógio dos 30 dias começa.
 * Pode ser chamada de novo depois de subir mais arquivos — só renova a data.
 */
export async function concluirEntrega(entrada: unknown): Promise<ResultadoEntrega> {
  await exigirAdmin();
  const analise = esquemaPrazoEntrega.safeParse(entrada);
  if (!analise.success) return { ok: false, erro: "Prazo inválido." };
  const { sessao_id, dias } = analise.data;

  // Numa função do banco, e não em "contar, depois atualizar": entre as duas
  // idas outra aba podia tirar a última tratada, e a sessão virava "entregue"
  // com zero arquivos — página vazia e zip 404 para o cliente. A função só
  // fecha se ainda existir arquivo, tudo num comando só.
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("concluir_entrega", { p_sessao: sessao_id, p_dias: dias });
  if (error) return { ok: false, erro: "Não deu pra concluir a entrega." };
  if (!data) {
    return { ok: false, erro: "Suba as fotos tratadas antes de concluir (a sessão precisa estar finalizada)." };
  }

  atualizarTelas(sessao_id);
  return { ok: true };
}

/** Dá mais prazo ao cliente enquanto os arquivos ainda estão no bucket. */
export async function estenderEntrega(entrada: unknown): Promise<ResultadoEntrega> {
  await exigirAdmin();
  const analise = esquemaPrazoEntrega.safeParse(entrada);
  if (!analise.success) return { ok: false, erro: "Prazo inválido." };
  const { sessao_id, dias } = analise.data;

  const supabase = await criarClienteServidor();
  const { count } = await supabase
    .from("entregas")
    .select("id", { count: "exact", head: true })
    .eq("sessao_id", sessao_id)
    .is("excluida_em", null);
  // Depois que o cron apagou do bucket não há o que estender: só subindo de novo.
  if (!count) return { ok: false, erro: "Os arquivos já saíram do servidor. Suba as tratadas de novo." };

  const expira = new Date();
  expira.setDate(expira.getDate() + dias);
  const { data, error } = await supabase
    .from("sessoes")
    .update({ entrega_expira_em: expira.toISOString() })
    .eq("id", sessao_id)
    .in("status", ["entregue", "arquivada"])
    .select("id");
  if (error || !data?.length) return { ok: false, erro: "Não deu pra estender o prazo." };

  atualizarTelas(sessao_id);
  return { ok: true };
}

/** Tira uma tratada da entrega (subiu a errada). Apaga do bucket e do banco. */
export async function removerEntrega(entrada: unknown): Promise<ResultadoEntrega> {
  await exigirAdmin();
  const analise = esquemaRemoverEntrega.safeParse(entrada);
  if (!analise.success) return { ok: false, erro: "Pedido inválido." };
  const { sessao_id, entrega_id } = analise.data;

  const supabase = await criarClienteServidor();
  const { data: linha } = await supabase
    .from("entregas")
    .select("id, key_arquivo, key_miniatura")
    .eq("id", entrega_id)
    .eq("sessao_id", sessao_id)
    .maybeSingle();
  if (!linha) return { ok: false, erro: "Arquivo não encontrado." };

  const falhas = await apagarObjetos(
    [linha.key_arquivo as string, linha.key_miniatura as string | null].filter((k): k is string => !!k),
  );
  // Se o bucket não apagou, a linha fica: sem ela o objeto vira órfão pago.
  if (falhas.length > 0) return { ok: false, erro: "Não deu pra apagar do servidor. Tente de novo." };

  const { error } = await supabase.from("entregas").delete().eq("id", entrega_id);
  if (error) return { ok: false, erro: "Apagou do servidor, mas não do registro." };

  // Tirou a última: não há entrega, a sessão volta a esperar por ela.
  const { count } = await supabase
    .from("entregas")
    .select("id", { count: "exact", head: true })
    .eq("sessao_id", sessao_id)
    .is("excluida_em", null);
  if (!count) {
    await supabase
      .from("sessoes")
      .update({ status: "finalizada", entregue_em: null, entrega_expira_em: null })
      .eq("id", sessao_id)
      .eq("status", "entregue");
  }

  atualizarTelas(sessao_id);
  return { ok: true };
}


// -- apagar sessao (definitivo) -----------------------------------------------

/**
 * Apaga uma sessao inteira: todos os objetos do R2 e depois a linha no banco
 * (o cascade cuida de fotos, selecoes e entregas).
 *
 * Acao IRREVERSIVEL. O componente que chama exige confirmacao por digitacao
 * do titulo exato da sessao.
 */
export async function apagarSessao(entrada: unknown): Promise<ResultadoEntrega> {
  await exigirAdmin();
  const analise = esquemaAbrirSessao.safeParse(entrada);
  if (!analise.success) return { ok: false, erro: "Sessao invalida." };
  const { sessao_id } = analise.data;

  const supabase = await criarClienteServidor();
  const { data: sessao } = await supabase
    .from("sessoes")
    .select("status")
    .eq("id", sessao_id)
    .maybeSingle();

  if (!sessao) return { ok: false, erro: "Sessao nao encontrada." };

  // 1. Listar e apagar todos os objetos do R2 (selecao + entregas)
  const chavesSelecao = await listarChavesPorPrefixo(`${sessao_id}/`);
  const chavesEntrega = await listarChavesPorPrefixo(`entregas/${sessao_id}/`);
  const todasChaves = [...chavesSelecao, ...chavesEntrega];

  if (todasChaves.length > 0) {
    const falhas = await apagarObjetos(todasChaves);
    if (falhas.length > 0) {
      return {
        ok: false,
        erro: `Nao deu pra apagar ${falhas.length} arquivo(s) do servidor. Tente de novo.`,
      };
    }
  }

  // 2. Apagar a sessao do banco (cascade apaga fotos, selecoes e entregas)
  const { error } = await supabase.from("sessoes").delete().eq("id", sessao_id);
  if (error) return { ok: false, erro: "Nao deu pra apagar a sessao do banco." };

  atualizarTelas(sessao_id);
  revalidatePath("/admin");
  return { ok: true };
}