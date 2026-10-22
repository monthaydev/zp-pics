import type {
  ConfigDerivativos,
  Derivativos,
  PedidoWorker,
  RespostaWorker,
} from "./imagem-tipos";

export type { ConfigDerivativos, Derivativos } from "./imagem-tipos";

/**
 * Parâmetros do motor de imagem. **Estes números são o custo do projeto.**
 *
 * Antes de mexer em qualquer um deles, meça em `/admin/laboratorio` com fotos
 * reais. Peso alvo: ~25 KB por miniatura e ~250 KB por prévia, o que dá
 * ~110 MB num ensaio de 400 fotos contra ~14 GB dos originais.
 */
export const CONFIG_PADRAO: ConfigDerivativos = {
  thumb: { lado: 400, qualidade: 0.7 },
  preview: { lado: 1600, qualidade: 0.72 },
  // A recomendação de marca d'água (22/10/2026), calibrada em fotos-teste
  // nos extremos (muito clara, muito escura, textura, retrato) pelo
  // laboratório. O laboratório abre nela e mostra o porquê de cada número —
  // ver `RECOMENDACAO_MARCA`.
  //
  // Central e legenda existem mas nascem DESLIGADAS: no teste, a assinatura
  // central atravessava a boca no retrato, e a legenda "PROVA" saía com ~9px
  // no mosaico — ruído, não informação. As duas objeções vieram da pesquisa
  // e os testes confirmaram.
  marca: {
    texto: "ZP STUDIO",
    legenda: "",
    opacidade: 0.15,
    anguloGraus: -30,
    espacamento: 340,
    tamanhoFonte: 30,
    tamanhoCentral: 0,
    opacidadeCentral: 0.1,
    deformacao: 6,
  },
};

/**
 * Por que cada número da marca recomendada. É o que a caixa de recomendação
 * do laboratório mostra ao lado do valor — mudar um parâmetro sem saber o que
 * ele protege é como a marca volta a ser removível ou a atrapalhar a foto.
 */
export const RECOMENDACAO_MARCA: Record<
  Exclude<keyof NonNullable<ConfigDerivativos["marca"]>, "texto" | "legenda">,
  string
> = {
  opacidade: "15%: baixa o bastante para julgar cor e exposição, alta o bastante para não sumir em foto clara ou na tela do celular com pouco brilho.",
  anguloGraus: "Diagonal cruza o assunto em qualquer enquadramento, deitado ou em pé.",
  espacamento: "Toda área do tamanho de um rosto recortado leva pelo menos uma assinatura.",
  tamanhoFonte: "Legível no celular, pequena o bastante para não disputar com a foto.",
  tamanhoCentral: "Desligada: no retrato ela atravessa a boca e o olhar, que é o que o cliente está julgando. O mosaico já cobre o miolo.",
  opacidadeCentral: "Só vale se a central for ligada: mais apagada que o mosaico, porque fica em cima do que mais importa.",
  deformacao: "Poucos pixels, invisível a olho nu, e única por foto: impede remover a marca do ensaio inteiro de uma vez.",
};

/**
 * Quantos workers rodam ao mesmo tempo.
 *
 * Teto baixo de propósito: cada worker segura um bitmap descomprimido que passa
 * de 90 MB numa foto de 24 MP. Paralelizar demais não acelera nada e estoura a
 * memória no meio de um ensaio grande.
 */
function concorrenciaPadrao() {
  const nucleos = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4;
  return Math.min(3, Math.max(1, nucleos - 1));
}

/** Teto por foto. Acima disso, o worker é descartado — decodificação nunca volta. */
const TEMPO_LIMITE_FOTO = 120_000;

export type FalhaDerivativo = { nomeOriginal: string; erro: string };

export type ProgressoLote = {
  concluidas: number;
  total: number;
  ultima: Derivativos | null;
  falha: FalhaDerivativo | null;
};

export type ResultadoLote = {
  derivativos: Derivativos[];
  falhas: FalhaDerivativo[];
};

/**
 * Gera os derivativos de um lote de arquivos numa fila com N workers.
 *
 * Uma falha isolada **não** derruba o lote — num ensaio de 400 fotos, perder as
 * 399 boas porque uma estava corrompida é inaceitável. Ela vai pra lista de
 * falhas e o admin reprocessa só ela.
 */
export async function gerarDerivativos(
  arquivos: File[],
  opcoes: {
    config?: ConfigDerivativos;
    concorrencia?: number;
    sinal?: AbortSignal;
    aoProgredir?: (progresso: ProgressoLote) => void;
  } = {},
): Promise<ResultadoLote> {
  const config = opcoes.config ?? CONFIG_PADRAO;
  const total = arquivos.length;
  const derivativos: Derivativos[] = [];
  const falhas: FalhaDerivativo[] = [];

  if (total === 0) return { derivativos, falhas };

  const quantidade = Math.min(opcoes.concorrencia ?? concorrenciaPadrao(), total);
  // Cada slot é uma CAIXA, não um worker fixo: um worker morto precisa ser
  // SUBSTITUÍDO, não reaproveitado. Antes, um evento `error` (fatal — a thread
  // não responde mais) tirava os ouvintes e chamava `puxar()` no mesmo worker
  // morto; o `postMessage` seguinte não ia a lugar nenhum, o `resolver()`
  // daquele slot nunca era chamado, e o `Promise.all` ficava pendurado para
  // sempre — a tela travava em "Gerando miniatura e prévia…" sem erro e sem
  // saída. Provado com um worker falso que morre na 1ª tarefa.
  const caixas = Array.from({ length: quantidade }, () => ({ atual: criarWorker() }));

  let proximo = 0;
  let concluidas = 0;

  const avisar = (ultima: Derivativos | null, falha: FalhaDerivativo | null) => {
    concluidas += 1;
    opcoes.aoProgredir?.({ concluidas, total, ultima, falha });
  };

  try {
    await Promise.all(
      caixas.map(
        (caixa) =>
          new Promise<void>((resolver) => {
            const puxar = () => {
              if (opcoes.sinal?.aborted || proximo >= total) return resolver();

              const indice = proximo++;
              const arquivo = arquivos[indice];
              const id = `${indice}`;
              const worker = caixa.atual;

              // Sem teto, uma decodificação que nunca volta (arquivo gigante,
              // memória no limite) segura o lote inteiro em silêncio.
              const relogio = setTimeout(() => {
                encerrar();
                worker.terminate();
                caixa.atual = criarWorker();
                const falha = {
                  nomeOriginal: arquivo.name,
                  erro: "Demorou demais para processar — arquivo muito grande ou navegador sem memória.",
                };
                falhas.push(falha);
                avisar(null, falha);
                puxar();
              }, TEMPO_LIMITE_FOTO);

              const encerrar = () => {
                clearTimeout(relogio);
                worker.removeEventListener("message", aoResponder);
                worker.removeEventListener("error", aoErrar);
              };

              const aoResponder = (evento: MessageEvent<RespostaWorker>) => {
                if (evento.data.id !== id) return;
                encerrar();

                if (evento.data.ok) {
                  const pronto: Derivativos = {
                    ...evento.data,
                    nomeOriginal: arquivo.name,
                  };
                  derivativos.push(pronto);
                  avisar(pronto, null);
                } else {
                  const falha = { nomeOriginal: arquivo.name, erro: evento.data.erro };
                  falhas.push(falha);
                  avisar(null, falha);
                }
                puxar();
              };

              const aoErrar = (evento: ErrorEvent) => {
                encerrar();
                // Fatal: a thread não responde mais. Descarta e entra uma nova
                // no lugar dela — reaproveitar o mesmo worker é o que travava.
                worker.terminate();
                caixa.atual = criarWorker();
                const falha = {
                  nomeOriginal: arquivo.name,
                  erro: evento.message || "Worker falhou.",
                };
                falhas.push(falha);
                avisar(null, falha);
                puxar();
              };

              worker.addEventListener("message", aoResponder);
              worker.addEventListener("error", aoErrar);
              worker.postMessage({ id, arquivo, config } satisfies PedidoWorker);
            };

            puxar();
          }),
      ),
    );
  } finally {
    caixas.forEach((c) => c.atual.terminate());
  }

  // A ordem de chegada é a de quem terminou primeiro, não a da pasta. O cliente
  // precisa ver o ensaio na sequência em que foi fotografado.
  derivativos.sort((a, b) => comparaNomeNatural(a.nomeOriginal, b.nomeOriginal));

  return { derivativos, falhas };
}

function criarWorker() {
  return new Worker(new URL("./imagem.worker.ts", import.meta.url), {
    type: "module",
  });
}

/**
 * Ordena `_ZP9.jpg` antes de `_ZP10.jpg` — o alfabético puro faria o contrário
 * e o ensaio chegaria fora de ordem na galeria.
 */
export function comparaNomeNatural(a: string, b: string) {
  return a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" });
}

export function formatarBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
