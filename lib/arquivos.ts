/**
 * Utilidades do upload. Rodam no navegador — nada de `server-only` aqui.
 */

const EXTENSOES = /\.(jpe?g|png|webp|hei[cf]|avif)$/i;

export function ehImagem(arquivo: File) {
  // O `type` vem vazio para HEIC em vários navegadores, então a extensão é o
  // desempate — não dá pra descartar foto de iPhone por causa disso.
  return arquivo.type.startsWith("image/") || EXTENSOES.test(arquivo.name);
}

/**
 * Extrai os arquivos de um "drop", entrando nas pastas.
 *
 * `dataTransfer.files` traz a pasta como um item vazio: quem arrasta a pasta do
 * ensaio inteiro receberia zero fotos. Por isso descemos a árvore pela API de
 * entries, que é a única que enxerga o conteúdo.
 */
export async function arquivosDoDrop(
  dados: DataTransfer,
  // A entrega das tratadas passa o seu: aceita TIFF, que o upload das prévias
  // não aceita (o navegador não decodifica).
  filtro: (arquivo: File) => boolean = ehImagem,
): Promise<File[]> {
  const entradas = Array.from(dados.items)
    .map((item) => item.webkitGetAsEntry?.() ?? null)
    .filter((e): e is FileSystemEntry => e !== null);

  if (entradas.length === 0) {
    return Array.from(dados.files).filter(filtro);
  }

  const encontrados: File[] = [];
  await Promise.all(entradas.map((e) => descer(e, encontrados)));
  return encontrados.filter(filtro);
}

async function descer(entrada: FileSystemEntry, saida: File[]): Promise<void> {
  if (entrada.isFile) {
    const arquivo = await new Promise<File | null>((resolver) =>
      (entrada as FileSystemFileEntry).file(resolver, () => resolver(null)),
    );
    if (arquivo) saida.push(arquivo);
    return;
  }

  if (!entrada.isDirectory) return;

  const leitor = (entrada as FileSystemDirectoryEntry).createReader();
  // readEntries devolve no máximo 100 por chamada e um array vazio no fim —
  // ler uma vez só perderia silenciosamente as fotos 101 em diante.
  for (;;) {
    const lote = await new Promise<FileSystemEntry[]>((resolver) =>
      leitor.readEntries(resolver, () => resolver([])),
    );
    if (lote.length === 0) break;
    await Promise.all(lote.map((e) => descer(e, saida)));
  }
}

/**
 * `crypto.randomUUID` só existe em contexto seguro. Abrir o painel pelo IP da
 * LAN — que é como se testa no celular — deixa ele `undefined` e derrubava a
 * carga inteira com "crypto.randomUUID is not a function".
 */
export function uuid(): string {
  if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // versão 4
  b[8] = (b[8] & 0x3f) | 0x80; // variante RFC 4122
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Roda as tarefas com no máximo N em voo. Devolve na ordem de entrada. */
export async function comConcorrencia<T>(
  tarefas: (() => Promise<T>)[],
  limite: number,
): Promise<T[]> {
  const resultados = new Array<T>(tarefas.length);
  let proximo = 0;

  const trabalhador = async () => {
    for (;;) {
      const i = proximo++;
      if (i >= tarefas.length) return;
      resultados[i] = await tarefas[i]();
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(limite, tarefas.length) }, trabalhador),
  );
  return resultados;
}
