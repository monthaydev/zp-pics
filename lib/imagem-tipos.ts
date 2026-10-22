/**
 * Contrato entre `lib/imagem.ts` (a fila) e `lib/imagem.worker.ts` (o motor).
 *
 * Fica num arquivo próprio porque o worker não pode importar nada que arraste
 * DOM junto — e um arquivo só de tipos não arrasta nada.
 */

/**
 * Todas as medidas em px são na escala de uma prévia de 1600px no lado maior —
 * o motor reescala para o tamanho real da imagem.
 */
export type ConfigMarca = {
  /** A assinatura, em Anton caixa alta. */
  texto: string;
  /** Segunda linha, pequena, em mono, sob a assinatura. Vazio desliga. */
  legenda: string;
  /** Opacidade do mosaico, 0 a 1. Acima de ~0,18 atrapalha julgar a foto. */
  opacidade: number;
  anguloGraus: number;
  /** Distância entre repetições do mosaico. */
  espacamento: number;
  /** Tamanho da assinatura no mosaico. */
  tamanhoFonte: number;
  /**
   * Assinatura grande no centro. É o que impede um recorte limpo do miolo da
   * foto, onde quase sempre está o assunto. 0 desliga.
   */
  tamanhoCentral: number;
  opacidadeCentral: number;
  /**
   * Amplitude da deformação geométrica, única por foto. Uma marca idêntica em
   * 400 fotos pode ser estimada e removida automaticamente a partir da coleção
   * (Dekel et al., "On the Effectiveness of Visible Watermarks", CVPR 2017);
   * variar só posição e opacidade não resolve, deformar resolve — e já com
   * pouquíssima amplitude. 0 desliga.
   */
  deformacao: number;
};

export type ConfigDerivativos = {
  thumb: { lado: number; qualidade: number };
  preview: { lado: number; qualidade: number };
  /** `null` desliga a marca d'água — usado só na bancada de medição. */
  marca: ConfigMarca | null;
};

export type PedidoWorker = {
  id: string;
  arquivo: File;
  config: ConfigDerivativos;
};

export type RespostaWorker =
  | {
      id: string;
      ok: true;
      thumb: Blob;
      preview: Blob;
      /** Dimensões da PRÉVIA — é o que a grade usa pra reservar espaço (CLS 0). */
      largura: number;
      altura: number;
      larguraOriginal: number;
      alturaOriginal: number;
      bytesOriginal: number;
      msDecodificacao: number;
      msTotal: number;
    }
  | { id: string; ok: false; erro: string };

export type Derivativos = Extract<RespostaWorker, { ok: true }> & {
  nomeOriginal: string;
};
