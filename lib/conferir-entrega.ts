/**
 * Confere as fotos tratadas contra as escolhidas, antes de subir.
 *
 * É a trava contra o erro mais fácil desta tela: arrastar a pasta de outro
 * cliente. Sem isto a ZP só descobriria quando o cliente abrisse a entrega
 * com fotos de um desconhecido.
 *
 * O nome tratado quase nunca é idêntico ao original: o Lightroom exporta
 * `_ZP4821.jpg` ou `_ZP4821-Editar.jpg`, e a extensão muda (`.tif`). Então casa
 * pelo nome SEM extensão, ignorando caixa, e aceita um sufixo — mas só depois
 * de um separador. `_ZP482` não pode casar com `_ZP4821`: o caractere depois do
 * nome tem que ser um que não seja letra nem dígito.
 *
 * Função pura, sem DOM: roda no navegador da ZP e em qualquer teste.
 */

const semExtensao = (nome: string) => nome.replace(/\.[^./\\]+$/, "").toLowerCase();

export type Conferencia = {
  /** Cada arquivo que corresponde a uma escolhida, na ordem em que vieram. */
  batem: { escolhida: string; arquivo: string }[];
  /** Arquivos que não correspondem a nenhuma escolhida. Não sobem sem confirmar. */
  foraDasEscolhidas: string[];
  /** Escolhidas para as quais não veio nenhum arquivo tratado. */
  faltam: string[];
};

export function conferirEntrega(escolhidas: string[], arquivos: string[]): Conferencia {
  const bases = escolhidas.map((nome) => ({ nome, base: semExtensao(nome) }));

  const batem: Conferencia["batem"] = [];
  const foraDasEscolhidas: string[] = [];
  const cobertas = new Set<string>();

  for (const arquivo of arquivos) {
    const base = semExtensao(arquivo);
    let melhor: { nome: string; base: string } | null = null;

    for (const candidata of bases) {
      const casa =
        base === candidata.base ||
        (base.startsWith(candidata.base) && !/[a-z0-9]/i.test(base.charAt(candidata.base.length)));
      // Em empate entre `_ZP4821` e `_ZP4821-2`, vence a mais específica.
      if (casa && (!melhor || candidata.base.length > melhor.base.length)) melhor = candidata;
    }

    if (melhor) {
      batem.push({ escolhida: melhor.nome, arquivo });
      cobertas.add(melhor.nome);
    } else {
      foraDasEscolhidas.push(arquivo);
    }
  }

  return {
    batem,
    foraDasEscolhidas,
    faltam: escolhidas.filter((nome) => !cobertas.has(nome)),
  };
}

/**
 * O arquivo é um dos formatos aceitos na entrega? Decide SÓ pela extensão.
 *
 * Antes caía no tipo que o navegador declara (`file.type`) quando a extensão não
 * era conhecida — e o navegador declara o que a extensão sugere, então um `.CR2`
 * renomeado ou um RAW que o sistema operacional rotula como imagem passaria. O
 * servidor repete a conferência (`extensaoBate` em `lib/schemas.ts`); aqui ela
 * só poupa uma ida à rede.
 */
export function tipoDeEntrega(nome: string): "image/jpeg" | "image/tiff" | null {
  if (/\.jpe?g$/i.test(nome)) return "image/jpeg";
  if (/\.tiff?$/i.test(nome)) return "image/tiff";
  return null;
}
