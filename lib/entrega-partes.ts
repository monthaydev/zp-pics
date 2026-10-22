/**
 * Divide a entrega em partes de zip.
 *
 * O zip passa pela função da Vercel, e uma função tem teto de duração
 * (`maxDuration`, 300 s). Num 4G de ~2,5 MB/s isso rende uns 750 MB; uma
 * entrega maior que isso seria cortada sempre no mesmo ponto, e como o
 * download recomeça do zero, falharia de novo. Partes de ~400 MB cabem com
 * folga mesmo numa conexão ruim, e o cliente baixa uma de cada vez.
 *
 * Os arquivos individuais NÃO têm esse teto: eles saem por URL assinada
 * direto do R2, que aceita `Range` e retoma.
 *
 * Gulosa e na ordem: a parte 1 leva os primeiros arquivos, a 2 os seguintes.
 * Um arquivo maior que o limite fica sozinho na sua parte.
 */
export const LIMITE_PARTE_ZIP = 400 * 1024 * 1024;

export function dividirEmPartes<T extends { tamanho_bytes: number }>(
  itens: T[],
  limite = LIMITE_PARTE_ZIP,
): T[][] {
  const partes: T[][] = [];
  let atual: T[] = [];
  let soma = 0;

  for (const item of itens) {
    if (atual.length > 0 && soma + item.tamanho_bytes > limite) {
      partes.push(atual);
      atual = [];
      soma = 0;
    }
    atual.push(item);
    soma += item.tamanho_bytes;
  }
  if (atual.length > 0) partes.push(atual);
  return partes;
}
