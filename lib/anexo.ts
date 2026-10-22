/**
 * `Content-Disposition` com o nome do arquivo.
 *
 * Duas formas: `filename` em ASCII para quem não entende a outra, e
 * `filename*` em UTF-8 — o nome da tratada é o que o cliente vai procurar na
 * pasta de downloads, e acento perdido vira "arquivo estranho".
 *
 * Aspas e barra invertida viram `_`: um nome com `"` ou quebra de linha não
 * pode fechar o parâmetro e injetar outro cabeçalho. A quebra de linha já cai
 * na troca de tudo fora do ASCII imprimível.
 *
 * Fica fora de `lib/r2.ts` e de `lib/entrega-cliente.ts` (os dois são
 * `server-only`, e este não precisa ser): é função pura, testável sem montar
 * nada, e as duas pontas — a rota do zip e a URL assinada do arquivo — usam.
 */
export function dispositivoDeAnexo(nome: string) {
  const ascii = nome.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nome)}`;
}
