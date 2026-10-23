import "server-only";

import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { dispositivoDeAnexo } from "@/lib/anexo";

/**
 * Cloudflare R2 — onde moram as imagens.
 *
 * A escolha do R2 sobre o Supabase Storage é a decisão de custo do projeto:
 * o R2 não cobra tráfego de saída, e numa galeria de fotos o egress é o que
 * pesa (cada cliente abre centenas de prévias, às vezes mais de uma vez).
 *
 * O bucket é PRIVADO. Nada aqui gera URL pública. As imagens saem só pela
 * rota `app/api/img/[...key]`, que confere o cookie da sessão.
 */

let clienteCache: S3Client | null = null;

function cliente() {
  if (clienteCache) return clienteCache;
  clienteCache = new S3Client({
    region: "auto",
    endpoint: `https://${exigir("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: exigir("R2_ACCESS_KEY_ID"),
      secretAccessKey: exigir("R2_SECRET_ACCESS_KEY"),
    },
  });
  return clienteCache;
}

function exigir(nome: string) {
  const valor = process.env[nome];
  if (!valor) throw new Error(`Variável de ambiente ausente: ${nome}`);
  return valor;
}

function balde() {
  return exigir("R2_BUCKET");
}

export type Derivativo = "thumb" | "preview";

/**
 * Chave do objeto no bucket.
 *
 * O caminho começa pelo id da sessão porque é assim que a rota `api/img`
 * confere, num prefixo só, se a chave pedida pertence à sessão do cookie —
 * e porque apagar uma sessão inteira vira um delete por prefixo.
 */
export function chaveObjeto(sessaoId: string, fotoId: string, tipo: Derivativo) {
  return `${sessaoId}/${fotoId}_${tipo}.webp`;
}

/** Extrai o id da sessão de uma chave. Devolve `null` se a chave for malformada. */
export function sessaoDaChave(chave: string): string | null {
  const partes = chave.split("/");
  // Segmento vazio, `.` ou `..` nunca é parte de uma chave nossa. Recusar aqui
  // fecha de antemão qualquer tentativa de subir um nível e sair do prefixo da
  // própria sessão — a rota `api/img` confere só o primeiro segmento.
  if (partes.some((p) => p === "" || p === "." || p === "..")) return null;
  const [sessaoId, resto] = partes;
  if (!sessaoId || !resto) return null;
  return sessaoId;
}

/**
 * URL pré-assinada de upload, emitida só para o admin autenticado.
 *
 * Vida curta: o upload acontece agora. Uma URL de PUT que dura horas é uma
 * porta aberta pra escrever no bucket.
 */
export function urlDeUpload(
  chave: string,
  expiraEm = 60 * 10,
  tipo = "image/webp",
  /**
   * Tamanho exato do que vai subir. Entra na assinatura: o bucket recusa um PUT
   * de outro tamanho. Sem isto o limite de 500 MB do zod não valia na escrita —
   * a URL aceitava até ~5 GB, e um segundo PUT com a URL ainda viva trocava o
   * conteúdo de um arquivo já registrado, deixando o `tamanho_bytes` do banco
   * (e o tamanho previsto do zip) errado.
   */
  tamanho?: number,
) {
  return getSignedUrl(
    cliente(),
    new PutObjectCommand({
      Bucket: balde(),
      Key: chave,
      ContentType: tipo,
      ...(tamanho ? { ContentLength: tamanho } : {}),
    }),
    { expiresIn: expiraEm },
  );
}

/**
 * URL assinada de DOWNLOAD de uma tratada, de vida curta (5 minutos).
 *
 * É por onde o cliente baixa cada foto: o navegador é redirecionado para o R2 e
 * baixa direto, sem passar pela função da Vercel. Três ganhos de uma vez — não
 * há teto de duração (um TIFF de 500 MB não é cortado aos 300 s), o R2 aceita
 * `Range` (o download retoma de onde parou), e a banda da Vercel não paga a
 * entrega. O `ResponseContentDisposition` assinado faz o navegador salvar com o
 * nome certo, como anexo.
 *
 * A regra do projeto é "zero URL assinada de longa duração", e 5 minutos é o
 * oposto de longa: o crachá é conferido a cada clique, e a URL só existe entre
 * o clique e o início do download.
 */
export function urlDeDownload(chave: string, nomeArquivo: string, expiraEm = 60 * 5) {
  return getSignedUrl(
    cliente(),
    new GetObjectCommand({
      Bucket: balde(),
      Key: chave,
      ResponseContentDisposition: dispositivoDeAnexo(nomeArquivo),
    }),
    { expiresIn: expiraEm },
  );
}

/**
 * Chave de uma foto TRATADA, na entrega.
 *
 * Prefixo `entregas/` à parte, e não o id da sessão: a rota `api/img` confere o
 * primeiro segmento da chave contra a sessão do cookie, e `entregas` nunca é um
 * id de sessão — então estes objetos não saem por ela, só pela rota própria da
 * entrega. É também o que deixa o cron de expiração e o `limpar-orfaos.mjs`
 * distinguirem uma coisa da outra.
 */
export function chaveEntrega(sessaoId: string, entregaId: string, tipo: "arquivo" | "miniatura") {
  return tipo === "arquivo"
    ? `entregas/${sessaoId}/${entregaId}`
    : `entregas/${sessaoId}/${entregaId}_thumb.webp`;
}

/**
 * Tamanho do objeto no bucket, ou `null` se não existe.
 *
 * É como o servidor confere que o PUT do navegador chegou de verdade antes de
 * registrar a entrega — URL assinada não garante que o upload terminou.
 */
export async function tamanhoDoObjeto(chave: string): Promise<number | null> {
  try {
    const r = await cliente().send(new HeadObjectCommand({ Bucket: balde(), Key: chave }));
    return r.ContentLength ?? null;
  } catch (erro) {
    if (statusDoErro(erro) === 404) return null;
    throw erro;
  }
}

export type ObjetoDoBucket =
  | { naoModificado: true }
  | {
      naoModificado: false;
      corpo: ReadableStream | undefined;
      tipo: string;
      tamanho: number | undefined;
      etag: string | undefined;
    };

/**
 * Lê o objeto pra fazer stream pela nossa rota. O cliente nunca fala com o R2.
 *
 * `etagConhecida` é repassada ao R2 como `If-None-Match`: quando o navegador
 * revalida uma miniatura que já tem, o bucket responde 304 e não manda os bytes
 * — a economia acontece já na perna R2→servidor, não só na servidor→navegador.
 * Numa galeria de 400 fotos isso é a diferença entre 11 MB e nada a cada
 * revalidação.
 */
export async function obterObjeto(
  chave: string,
  etagConhecida?: string | null,
): Promise<ObjetoDoBucket> {
  try {
    const resposta = await cliente().send(
      new GetObjectCommand({
        Bucket: balde(),
        Key: chave,
        ...(etagConhecida ? { IfNoneMatch: etagConhecida } : {}),
      }),
    );
    return {
      naoModificado: false,
      corpo: resposta.Body as ReadableStream | undefined,
      tipo: resposta.ContentType ?? "image/webp",
      tamanho: resposta.ContentLength,
      etag: resposta.ETag,
    };
  } catch (erro) {
    // 304 chega como exceção no SDK da AWS, não como resposta. Sem este desvio
    // ele viraria o 404 genérico do catch da rota e o navegador baixaria tudo
    // de novo achando que a imagem sumiu.
    if (statusDoErro(erro) === 304) return { naoModificado: true };
    throw erro;
  }
}

function statusDoErro(erro: unknown): number | undefined {
  if (typeof erro !== "object" || erro === null) return undefined;
  const meta = (erro as { $metadata?: { httpStatusCode?: number } }).$metadata;
  return meta?.httpStatusCode;
}

/** Apaga em lote (limite de 1000 por chamada na API S3). */
/**
 * Apaga em lotes de 1.000 (o teto do S3) e devolve as chaves que **não** saíram.
 *
 * O `DeleteObjects` responde 200 mesmo quando falha em algumas chaves — a falha
 * vem por chave, em `Errors`, sem exceção nenhuma. Antes ninguém lia esse
 * retorno, e a finalização marcava como apagado o que continuava no bucket.
 * Nunca lança: um lote que estoura conta como falha inteira, e quem chama
 * decide o que fazer com o resto.
 */
export async function apagarObjetos(chaves: string[]): Promise<string[]> {
  const falhas: string[] = [];
  for (let i = 0; i < chaves.length; i += 1000) {
    const fatia = chaves.slice(i, i + 1000);
    try {
      const resposta = await cliente().send(
        new DeleteObjectsCommand({
          Bucket: balde(),
          Delete: { Objects: fatia.map((Key) => ({ Key })), Quiet: true },
        }),
      );
      for (const erro of resposta.Errors ?? []) {
        if (erro.Key) falhas.push(erro.Key);
      }
    } catch {
      falhas.push(...fatia);
    }
  }
  return falhas;
}


/**
 * Lista TODAS as chaves sob um prefixo do bucket.
 *
 * Pagina automaticamente (1.000 por ida), porque um ensaio com fotos de
 * seleção e entregas pode ter mais que o teto de uma página. Usado na
 * exclusão de sessão: apaga tudo do R2 antes de apagar do banco.
 */
export async function listarChavesPorPrefixo(prefixo: string): Promise<string[]> {
  const chaves: string[] = [];
  let token: string | undefined;
  do {
    const resposta = await cliente().send(
      new ListObjectsV2Command({
        Bucket: balde(),
        Prefix: prefixo,
        ContinuationToken: token,
      }),
    );
    for (const obj of resposta.Contents ?? []) {
      if (obj.Key) chaves.push(obj.Key);
    }
    token = resposta.IsTruncated ? resposta.NextContinuationToken : undefined;
  } while (token);
  return chaves;
}
