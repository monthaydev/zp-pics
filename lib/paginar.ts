/**
 * Lê uma consulta inteira, de 1.000 em 1.000.
 *
 * O Supabase devolve no máximo 1.000 linhas por pedido (`max_rows` padrão da
 * API) e não avisa que cortou: a resposta vem com `error: null` e as primeiras
 * mil. Num ensaio grande isso não é só uma grade incompleta — `idsEscolhidos`
 * truncado faz a finalização apagar do bucket as escolhidas além da milésima.
 *
 * A consulta precisa ter ordem estável (um `order` que desempate), senão duas
 * páginas podem repetir ou pular linhas.
 */
export const TAMANHO_PAGINA = 1000;

type Pagina<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/**
 * Corta uma lista de ids em fatias para filtros `.in(...)`.
 *
 * O `.in` vira query string — ~37 bytes por UUID. Com 2.000 ids são ~74 KB de
 * URL, e o gateway devolve 414 antes de o Postgres ver o pedido. 200 por fatia
 * fica em ~7 KB.
 */
export const TAMANHO_FATIA = 200;

export function emFatias<T>(lista: T[], tamanho = TAMANHO_FATIA): T[][] {
  const fatias: T[][] = [];
  for (let i = 0; i < lista.length; i += tamanho) fatias.push(lista.slice(i, i + tamanho));
  return fatias;
}

export async function lerTudo<T>(pagina: (de: number, ate: number) => Pagina<T>): Promise<T[]> {
  const todas: T[] = [];
  for (let de = 0; ; de += TAMANHO_PAGINA) {
    const { data, error } = await pagina(de, de + TAMANHO_PAGINA - 1);
    if (error) throw new Error(error.message);
    const linhas = data ?? [];
    todas.push(...linhas);
    if (linhas.length < TAMANHO_PAGINA) return todas;
  }
}
