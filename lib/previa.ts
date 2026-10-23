const pedidas = new Set<string>();

/**
 * Começa a baixar a prévia antes de o cliente abrir o lightbox.
 *
 * Bug sofrido: a prévia (1600 px) só começava a baixar no clique, passando pela
 * função da Vercel, e o lightbox ficava preto até ela terminar — enquanto a
 * miniatura já estava na grade. Hover (mouse) e toque iniciado dão uns
 * centésimos de segundo de vantagem; as vizinhas cobrem a navegação por seta.
 * O `Set` evita repetir o pedido a cada passada do cursor; o cache do navegador
 * (`immutable`) faz o resto.
 */
export function preCarregarPrevia(chave: string) {
  if (pedidas.has(chave)) return;
  pedidas.add(chave);
  const img = new Image();
  img.decoding = "async";
  img.src = `/api/img/${chave}`;
}
