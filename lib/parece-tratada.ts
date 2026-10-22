/**
 * Esta foto passou por um editor? Uma suspeita, nunca uma garantia.
 *
 * O erro que a conferência de nomes NÃO pega: a ZP arrasta a pasta do cartão
 * em vez da exportação do Lightroom. Os nomes batem 100% (`_ZP4821.jpg` é
 * `_ZP4821.jpg`), e o JPEG de câmera sem tratamento sobe como se fosse a
 * entrega — exatamente o que a Regra Número Um protege.
 *
 * Todo JPEG exportado por Lightroom, Photoshop, Capture One e afins grava o
 * nome do programa no `Software` do EXIF ou no XMP, nos primeiros KB do
 * arquivo. JPEG de câmera sem edição não tem. Lê só o começo (256 KB) e
 * procura o nome — barato, sem biblioteca, e só serve para AVISAR: um editor
 * que não esteja na lista, ou um arquivo com metadado removido na exportação,
 * dá falso aviso, e por isso o aviso nunca bloqueia.
 */
const EDITORES = /Lightroom|Photoshop|Adobe|Capture One|CaptureOne|DxO|Affinity|darktable|Luminar|ON1|Pixelmator|GIMP|Camera Raw/i;

export async function parecePassadoPorEditor(arquivo: File): Promise<boolean> {
  const inicio = await arquivo.slice(0, 256 * 1024).arrayBuffer();
  // latin1: byte a byte, sem decodificar UTF-8 — o que interessa é achar o
  // texto ASCII do nome do programa no meio de dados binários.
  const texto = new TextDecoder("latin1").decode(inicio);
  return EDITORES.test(texto);
}
