/// <reference lib="webworker" />

/**
 * Motor de derivativos — o trabalho pesado.
 *
 * Roda em Web Worker porque decodificar e reencodar 400 JPEGs de câmera na
 * main thread congela a aba. Aqui dentro não existe DOM: só OffscreenCanvas.
 *
 * Entra um File original (que NUNCA sai da máquina do admin), saem dois
 * derivativos WebP: a miniatura da grade e a prévia com marca d'água.
 */

import type {
  ConfigMarca,
  PedidoWorker,
  RespostaWorker,
} from "./imagem-tipos";

/** Reduz preservando proporção, sem nunca ampliar — ampliar só gera peso. */
function caber(largura: number, altura: number, ladoMaior: number) {
  const maior = Math.max(largura, altura);
  if (maior <= ladoMaior) return { largura, altura };
  const escala = ladoMaior / maior;
  return {
    largura: Math.max(1, Math.round(largura * escala)),
    altura: Math.max(1, Math.round(altura * escala)),
  };
}

/**
 * As fontes da marca, carregadas uma vez por worker.
 *
 * A identidade do ZP Studio é puramente tipográfica — ZP STUDIO em Anton —, e
 * dentro de um worker não existe a fonte que o `next/font` injeta na página:
 * antes daqui a marca saía em `system-ui`, que é a fonte de qualquer site. Os
 * arquivos moram em `public/fonts` (licença OFL, junto). Se o navegador não
 * tiver `FontFace` em worker, a marca sai na fonte de reserva — nunca falha a
 * foto por causa disso.
 */
const FONTE_MARCA = '"ZP Anton", Impact, "Arial Narrow", sans-serif';
const FONTE_LEGENDA = '"ZP Mono", ui-monospace, "Courier New", monospace';
let fontesProntas: Promise<boolean> | null = null;

function carregarFontes() {
  fontesProntas ??= (async () => {
    try {
      const conjunto = (self as unknown as { fonts?: FontFaceSet }).fonts;
      if (!conjunto || typeof FontFace === "undefined") return false;
      const anton = new FontFace("ZP Anton", "url(/fonts/Anton-Regular.ttf)");
      const mono = new FontFace("ZP Mono", "url(/fonts/IBMPlexMono-Medium.ttf)");
      await Promise.all([anton.load(), mono.load()]);
      conjunto.add(anton);
      conjunto.add(mono);
      return true;
    } catch {
      return false;
    }
  })();
  return fontesProntas;
}

/** Sorteio num intervalo. Aleatório de verdade, por foto, de propósito: um
 * padrão reproduzível seria exatamente o que um removedor em lote aprende. */
function sortear(min: number, max: number) {
  return min + Math.random() * (max - min);
}

/**
 * Uma assinatura: ZP STUDIO em Anton e, embaixo, a legenda em mono.
 *
 * Off-white com contorno escuro fino e nítido: o contorno segura a leitura
 * num vestido branco, o off-white segura num fundo preto.
 *
 * Testado o halo borrado (sombra difusa) no lugar do contorno, em 22/10/2026:
 * numa foto clara a assinatura virava uma mancha cinza enevoada, com cara de
 * sujeira na lente. conforme confirmado nos testes visuais.
 */
function assinar(
  ctx: OffscreenCanvasRenderingContext2D,
  marca: ConfigMarca,
  tamanho: number,
  alfa: number,
) {
  ctx.globalAlpha = alfa;
  // Off-white do filme (`film-white`), não branco puro: branco puro sobre a
  // foto estoura como adesivo. O contorno é o preto de sala escura.
  ctx.fillStyle = "#edede8";
  ctx.strokeStyle = "rgba(5,5,5,0.6)";
  ctx.lineJoin = "round";
  ctx.textAlign = "center";

  ctx.font = `${tamanho}px ${FONTE_MARCA}`;
  // `tracking-cine` do site, um pouco mais aberto: na foto a assinatura é
  // lida de longe e meio apagada, e letra colada vira borrão.
  if ("letterSpacing" in ctx) {
    (ctx as unknown as { letterSpacing: string }).letterSpacing = `${(tamanho * 0.08).toFixed(1)}px`;
  }
  ctx.textBaseline = "alphabetic";
  ctx.lineWidth = Math.max(1, tamanho / 16);
  ctx.strokeText(marca.texto, 0, 0);
  ctx.fillText(marca.texto, 0, 0);

  if (marca.legenda) {
    const menor = Math.max(6, tamanho * 0.3);
    ctx.font = `500 ${menor}px ${FONTE_LEGENDA}`;
    if ("letterSpacing" in ctx) {
      (ctx as unknown as { letterSpacing: string }).letterSpacing = `${(menor * 0.32).toFixed(1)}px`;
    }
    ctx.textBaseline = "top";
    ctx.lineWidth = Math.max(1, menor / 10);
    ctx.strokeText(marca.legenda, 0, tamanho * 0.22);
    ctx.fillText(marca.legenda, 0, tamanho * 0.22);
  }
}

/**
 * Marca d'água: mosaico de assinaturas em diagonal + uma assinatura grande no
 * centro, desenhados numa camada à parte e colados na foto com uma deformação
 * geométrica única.
 *
 * Ela existe pra impedir uso, não pra estragar a avaliação da foto. Por isso
 * opacidade baixa e assinatura pequena no mosaico; a central é grande mas
 * mais apagada ainda.
 *
 * Por que a deformação (Dekel et al., CVPR 2017, Google Research): com a mesma
 * marca no mesmo lugar em 400 fotos, dá pra estimar a marca a partir da coleção
 * e subtraí-la de todas de uma vez. Sortear posição e opacidade não impede;
 * entortar a marca de um jeito diferente em cada foto impede, e uma
 * deformação de poucos pixels já basta. É o que o Shutterstock adotou.
 */
function aplicarMarca(
  ctx: OffscreenCanvasRenderingContext2D,
  largura: number,
  altura: number,
  marca: ConfigMarca,
) {
  // Tudo acompanha o tamanho da imagem: marca fixa some no 1600 e domina no 400.
  const escala = Math.max(largura, altura) / 1600;
  const tamanho = Math.max(6, marca.tamanhoFonte * escala);
  const passo = Math.max(tamanho * 3, marca.espacamento * escala);

  const camada = new OffscreenCanvas(largura, altura);
  const c = camada.getContext("2d");
  if (!c) return;

  // ── mosaico ───────────────────────────────────────────────────────────────
  // O plano gira inteiro e cobre mais que a tela, senão a rotação deixa os
  // cantos sem marca. A origem do mosaico e o ângulo variam um pouco por foto.
  c.save();
  c.translate(largura / 2 + sortear(-passo, passo) / 2, altura / 2 + sortear(-passo, passo) / 2);
  c.rotate(((marca.anguloGraus + sortear(-3, 3)) * Math.PI) / 180);
  const alcance = Math.hypot(largura, altura) / 2 + passo;
  for (let y = -alcance, linha = 0; y <= alcance; y += passo * 0.62, linha++) {
    // Linhas desencontradas: alinhadas viram grade e parecem defeito de impressão.
    const desloca = (linha % 2) * (passo / 2);
    for (let x = -alcance; x <= alcance; x += passo) {
      c.save();
      c.translate(x + desloca, y);
      // Cada cópia levemente diferente das vizinhas — a marca deixa de ser um
      // carimbo repetido que um algoritmo isola pela repetição.
      c.rotate((sortear(-1.5, 1.5) * Math.PI) / 180);
      const s = sortear(0.96, 1.04);
      c.scale(s, s);
      assinar(c, marca, tamanho, marca.opacidade);
      c.restore();
    }
  }
  c.restore();

  // ── assinatura central ────────────────────────────────────────────────────
  if (marca.tamanhoCentral > 0) {
    const grande = marca.tamanhoCentral * escala;
    c.save();
    c.translate(largura / 2 + sortear(-0.03, 0.03) * largura, altura / 2 + grande * 0.3);
    c.rotate((sortear(-2, 2) * Math.PI) / 180);
    assinar(c, marca, grande, marca.opacidadeCentral);
    c.restore();
  }

  // ── colagem com deformação ────────────────────────────────────────────────
  const amplitude = marca.deformacao * escala;
  if (amplitude <= 0) {
    ctx.drawImage(camada, 0, 0);
    return;
  }

  // Duas passadas de ondas senoidais com fase, comprimento e amplitude
  // sorteados: colunas sobem e descem, depois linhas vão e voltam. Fatias de
  // 4px, por isso a onda é suave — o olho lê texto inteiro, o algoritmo não
  // acha duas fotos com a marca no mesmo lugar.
  const FATIA = 4;
  const onda = () => ({
    a: amplitude * sortear(0.7, 1.3),
    l: sortear(260, 620) * escala,
    f: sortear(0, Math.PI * 2),
  });

  const intermediaria = new OffscreenCanvas(largura, altura);
  const m = intermediaria.getContext("2d");
  if (!m) {
    ctx.drawImage(camada, 0, 0);
    return;
  }
  const v = onda();
  for (let x = 0; x < largura; x += FATIA) {
    const dy = v.a * Math.sin((x / v.l) * Math.PI * 2 + v.f);
    m.drawImage(camada, x, 0, FATIA, altura, x, dy, FATIA, altura);
  }
  const h = onda();
  for (let y = 0; y < altura; y += FATIA) {
    const dx = h.a * Math.sin((y / h.l) * Math.PI * 2 + h.f);
    ctx.drawImage(intermediaria, 0, y, largura, FATIA, dx, y, largura, FATIA);
  }
}

async function renderizar(
  origem: ImageBitmap,
  ladoMaior: number,
  qualidade: number,
  marca: ConfigMarca | null,
): Promise<{ blob: Blob; largura: number; altura: number }> {
  const alvo = caber(origem.width, origem.height, ladoMaior);
  const canvas = new OffscreenCanvas(alvo.largura, alvo.altura);
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("OffscreenCanvas 2d indisponível neste navegador.");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(origem, 0, 0, alvo.largura, alvo.altura);

  if (marca) aplicarMarca(ctx, alvo.largura, alvo.altura, marca);

  // O canvas já descarta EXIF: o derivativo sai sem GPS, sem série da câmera,
  // sem nada. Não reintroduza metadado achando que é otimização.
  const blob = await canvas.convertToBlob({ type: "image/webp", quality: qualidade });
  return { blob, largura: alvo.largura, altura: alvo.altura };
}

self.onmessage = async (evento: MessageEvent<PedidoWorker>) => {
  const { id, arquivo, config } = evento.data;
  const t0 = performance.now();
  let original: ImageBitmap | null = null;

  try {
    // `from-image` respeita a orientação EXIF. Sem isso, foto vertical de
    // câmera chega deitada na galeria — e o cliente acha que o site quebrou.
    // A fonte da marca chega em paralelo com a decodificação; as duas coisas
    // só precisam estar prontas na hora de desenhar a prévia.
    const fontes = config.marca ? carregarFontes() : null;
    original = await createImageBitmap(arquivo, { imageOrientation: "from-image" });
    await fontes;
    const msDecodificacao = performance.now() - t0;

    const preview = await renderizar(
      original,
      config.preview.lado,
      config.preview.qualidade,
      config.marca,
    );
    const thumb = await renderizar(original, config.thumb.lado, config.thumb.qualidade, null);

    const resposta: RespostaWorker = {
      id,
      ok: true,
      thumb: thumb.blob,
      preview: preview.blob,
      largura: preview.largura,
      altura: preview.altura,
      larguraOriginal: original.width,
      alturaOriginal: original.height,
      bytesOriginal: arquivo.size,
      msDecodificacao,
      msTotal: performance.now() - t0,
    };
    self.postMessage(resposta);
  } catch (erro) {
    const bruto = erro instanceof Error ? erro.message : String(erro);
    // HEIC do iPhone não decodifica no Chrome. Aqui o esperado é JPEG exportado
    // do Lightroom, mas se aparecer HEIC o admin precisa entender o porquê.
    const ehHeic = /\.hei[cf]$/i.test(arquivo.name);
    self.postMessage({
      id,
      ok: false,
      erro: ehHeic
        ? "HEIC não é suportado pelo navegador. Exporte como JPEG antes de subir."
        : bruto,
    } satisfies RespostaWorker);
  } finally {
    // Um bitmap de 6000×4000 ocupa ~96 MB. Com vários workers, esquecer o
    // close() estoura a memória na metade de um ensaio grande.
    original?.close();
  }
};

export {};
