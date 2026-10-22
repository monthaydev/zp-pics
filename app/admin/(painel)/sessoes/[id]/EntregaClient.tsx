"use client";

import { Loader2, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { arquivosDoDrop, comConcorrencia } from "@/lib/arquivos";
import { conferirEntrega, tipoDeEntrega } from "@/lib/conferir-entrega";
import { comparaNomeNatural, gerarDerivativos, formatarBytes } from "@/lib/imagem";
import { parecePassadoPorEditor } from "@/lib/parece-tratada";
import { TAMANHO_MAXIMO_ENTREGA } from "@/lib/schemas";

import { pedirUrlsEntrega, registrarEntrega } from "./entrega-acoes";

/**
 * Subir as fotos tratadas — o que o cliente vai baixar.
 *
 * Três coisas que importam aqui, todas pela mesma razão: a tratada é o produto.
 *
 * 1. **O arquivo sobe como está.** Sem reprocessar, sem reduzir, sem marca
 *    d'água, sem recompressão. O que o cliente baixa tem o mesmo conteúdo, byte
 *    a byte, do que saiu do Lightroom. Só a miniatura da grade é gerada aqui.
 * 2. **Confere contra as escolhidas antes de subir.** Arrastar a pasta de outro
 *    cliente é o erro mais fácil desta tela, e só seria descoberto quando o
 *    cliente abrisse a entrega com fotos de um desconhecido.
 * 3. **Direto para o bucket.** Uma tratada de 20 MB passando pela função da
 *    Vercel esbarra no teto de 4,5 MB de corpo; o servidor só assina a URL e,
 *    depois, confere o tamanho do que chegou.
 */

const LOTE = 6;
/** Miniatura da grade da entrega. A prévia que o motor também devolve é
 * descartada: 64 px, só para o motor ter o que devolver. */
const CONFIG_MINIATURA = {
  thumb: { lado: 480, qualidade: 0.74 },
  preview: { lado: 64, qualidade: 0.3 },
  marca: null,
};

type Falha = { nome: string; erro: string };

/** Tira o ruído de pastas grandes: mostra alguns nomes e conta o resto. */
function resumirNomes(nomes: string[], max = 8) {
  if (nomes.length <= max) return nomes.join(", ");
  return `${nomes.slice(0, max).join(", ")} e mais ${nomes.length - max}`;
}

async function enviarArquivo(url: string, corpo: Blob, tipo: string) {
  let ultimo = "";
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      const r = await fetch(url, { method: "PUT", body: corpo, headers: { "Content-Type": tipo } });
      if (r.ok) return;
      ultimo = `o bucket recusou (HTTP ${r.status})`;
    } catch {
      ultimo = "o navegador não alcançou o bucket (rede ou CORS do R2)";
    }
    await new Promise((resolver) => setTimeout(resolver, 600 * (tentativa + 1)));
  }
  throw new Error(ultimo);
}

async function dimensoes(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  const d = { largura: bitmap.width, altura: bitmap.height };
  bitmap.close();
  return d;
}

export default function EntregaClient({
  sessaoId,
  escolhidas,
  jaEntregues,
}: {
  sessaoId: string;
  /** `nome_original` de cada escolhida, na ordem do ensaio. */
  escolhidas: string[];
  /** `nome_arquivo` do que já foi entregue — a retomada pula estes. */
  jaEntregues: string[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [arquivos, setArquivos] = useState<File[]>([]);
  const [recusados, setRecusados] = useState<string[]>([]);
  /** Nomes que apareceram mais de uma vez (em subpastas diferentes). */
  const [repetidosNoDrop, setRepetidosNoDrop] = useState<string[]>([]);
  /** Parece pasta do cartão: JPEGs sem sinal de editor. Só avisa, nunca bloqueia. */
  const [suspeitaDeOriginal, setSuspeitaDeOriginal] = useState(false);
  const [incluirFora, setIncluirFora] = useState(false);
  const [sobreArea, setSobreArea] = useState(false);

  const [rodando, setRodando] = useState(false);
  const [etapa, setEtapa] = useState("");
  const [feitas, setFeitas] = useState(0);
  const [total, setTotal] = useState(0);
  const [falhas, setFalhas] = useState<Falha[]>([]);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [terminou, setTerminou] = useState<number | null>(null);

  const jaSet = useMemo(() => new Set(jaEntregues), [jaEntregues]);

  const conferencia = useMemo(() => {
    // Conta o que já foi entregue como coberto: quem retoma uma entrega pela
    // metade não deve ver "faltam 20" para o que já está lá.
    const nomes = [...new Set([...jaEntregues, ...arquivos.map((a) => a.name)])];
    return conferirEntrega(escolhidas, nomes);
  }, [escolhidas, arquivos, jaEntregues]);

  const foraSet = useMemo(() => new Set(conferencia.foraDasEscolhidas), [conferencia]);

  const pendentes = useMemo(
    () => arquivos.filter((a) => !jaSet.has(a.name) && (incluirFora || !foraSet.has(a.name))),
    [arquivos, jaSet, incluirFora, foraSet],
  );
  const repetidos = arquivos.filter((a) => jaSet.has(a.name)).length;
  const foraDeNovo = conferencia.foraDasEscolhidas.filter((n) => !jaSet.has(n));

  const receber = async (lista: File[]) => {
    const aceitos: File[] = [];
    const naoAceitos: string[] = [];
    const repetidos: string[] = [];
    const vistos = new Set<string>();
    for (const arquivo of lista) {
      if (!tipoDeEntrega(arquivo.name)) {
        naoAceitos.push(arquivo.name);
      } else if (vistos.has(arquivo.name)) {
        // Mesmo nome em duas subpastas (ex.: `Alta/_ZP4821.jpg` e
        // `Web/_ZP4821.jpg`). O cliente baixa por NOME, então só um pode
        // entrar — escolher qual é decisão da ZP, não do sistema.
        repetidos.push(arquivo.name);
      } else {
        vistos.add(arquivo.name);
        aceitos.push(arquivo);
      }
    }
    setArquivos(aceitos.sort((a, b) => comparaNomeNatural(a.name, b.name)));
    setRecusados(naoAceitos);
    setRepetidosNoDrop([...new Set(repetidos)]);

    // A conferência de nomes não pega a pasta do cartão: os nomes batem 100%
    // com os originais. Procura o sinal de um editor nos primeiros KB de cada
    // JPEG; se a maioria não tem, avisa.
    const jpegs = aceitos.filter((a) => tipoDeEntrega(a.name) === "image/jpeg");
    if (jpegs.length > 0) {
      const amostra = jpegs.slice(0, 12);
      const sinais = await Promise.all(amostra.map((a) => parecePassadoPorEditor(a).catch(() => true)));
      setSuspeitaDeOriginal(sinais.filter((s) => !s).length > amostra.length / 2);
    } else {
      setSuspeitaDeOriginal(false);
    }
    setIncluirFora(false);
    setFalhas([]);
    setErroGeral(null);
    setTerminou(null);
  };

  async function enviar() {
    if (!pendentes.length || rodando) return;

    setRodando(true);
    setFalhas([]);
    setErroGeral(null);
    setTerminou(null);
    setFeitas(0);
    setTotal(pendentes.length);

    const falhasLocais: Falha[] = [];
    let registradas = 0;

    try {
      for (let inicio = 0; inicio < pendentes.length; inicio += LOTE) {
        const lote = pendentes.slice(inicio, inicio + LOTE);
        const info = lote.map((arquivo) => ({
          arquivo,
          tipo: tipoDeEntrega(arquivo.name) as "image/jpeg" | "image/tiff",
        }));

        // Arquivo grande demais, antes de gastar rede.
        const cabem = info.filter(({ arquivo }) => {
          if (arquivo.size <= TAMANHO_MAXIMO_ENTREGA) return true;
          falhasLocais.push({
            nome: arquivo.name,
            erro: `passa de ${formatarBytes(TAMANHO_MAXIMO_ENTREGA)}`,
          });
          return false;
        });
        if (!cabem.length) continue;

        // Miniatura só de JPEG: o navegador não decodifica TIFF. Sem miniatura
        // a página do cliente mostra um quadro com o formato.
        setEtapa("Gerando miniaturas…");
        const jpegs = cabem.filter((i) => i.tipo === "image/jpeg").map((i) => i.arquivo);
        const miniaturas = new Map<string, { blob: Blob; largura: number; altura: number }>();
        if (jpegs.length) {
          const { derivativos } = await gerarDerivativos(jpegs, { config: CONFIG_MINIATURA });
          for (const d of derivativos) {
            miniaturas.set(d.nomeOriginal, { blob: d.thumb, ...(await dimensoes(d.thumb)) });
          }
        }

        setEtapa("Pedindo autorização…");
        const pedido = await pedirUrlsEntrega({
          sessao_id: sessaoId,
          arquivos: cabem.map(({ arquivo, tipo }) => ({
            nome: arquivo.name,
            tamanho: arquivo.size,
            tipo,
            // O servidor assina o tamanho exato da miniatura, e só emite a URL
            // dela se ela existe.
            tamanhoMiniatura: miniaturas.get(arquivo.name)?.blob.size,
          })),
        });
        if (!pedido.ok || !pedido.urls) {
          setErroGeral(pedido.erro ?? "Não deu pra autorizar o envio.");
          return;
        }
        const urlsPorNome = new Map(pedido.urls.map((u) => [u.nome, u]));

        setEtapa("Enviando…");
        const enviados: {
          id: string;
          nome: string;
          tamanho: number;
          tipo: "image/jpeg" | "image/tiff";
          temMiniatura: boolean;
          largura: number | null;
          altura: number | null;
        }[] = [];

        await comConcorrencia(
          cabem.map(({ arquivo, tipo }) => async () => {
            const url = urlsPorNome.get(arquivo.name);
            if (!url) return;
            try {
              await enviarArquivo(url.urlArquivo, arquivo, tipo);
              const mini = miniaturas.get(arquivo.name);
              let temMiniatura = false;
              if (mini && url.urlMiniatura) {
                try {
                  await enviarArquivo(url.urlMiniatura, mini.blob, "image/webp");
                  temMiniatura = true;
                } catch {
                  // A miniatura é detalhe: a foto sobe mesmo sem ela.
                }
              }
              enviados.push({
                id: url.id,
                nome: arquivo.name,
                tamanho: arquivo.size,
                tipo,
                temMiniatura,
                largura: temMiniatura ? (mini?.largura ?? null) : null,
                altura: temMiniatura ? (mini?.altura ?? null) : null,
              });
            } catch (e) {
              falhasLocais.push({ nome: arquivo.name, erro: e instanceof Error ? e.message : "falhou" });
            }
            setFeitas((n) => n + 1);
          }),
          3,
        );

        if (enviados.length) {
          setEtapa("Conferindo no servidor…");
          const r = await registrarEntrega({ sessao_id: sessaoId, itens: enviados });
          registradas += r.registrados ?? 0;
          for (const nome of r.falhas ?? []) {
            falhasLocais.push({ nome, erro: "não chegou inteiro ao servidor" });
          }
          if (!r.ok && !r.falhas?.length) {
            setErroGeral(r.erro ?? "Não deu pra registrar a entrega.");
            return;
          }
        }
        setFalhas([...falhasLocais]);
      }
    } catch (e) {
      setErroGeral(e instanceof Error ? e.message : "Algo deu errado no envio.");
    } finally {
      setFalhas(falhasLocais);
      setTerminou(registradas);
      setRodando(false);
      setEtapa("");
      // Atualiza a lista de entregues e libera o "Concluir entrega".
      router.refresh();
    }
  }

  const porcento = total ? Math.round((feitas / total) * 100) : 0;

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setSobreArea(true);
        }}
        onDragLeave={() => setSobreArea(false)}
        onDrop={async (e) => {
          e.preventDefault();
          setSobreArea(false);
          if (rodando) return;
          // O filtro deixa passar também os RAW, para eles aparecerem em
          // "Formato não aceito" em vez de sumirem sem explicação.
          await receber(
            await arquivosDoDrop(
              e.dataTransfer,
              (a) => !!tipoDeEntrega(a.name) || /\.(cr[23w]|nef|nrw|arw|dng|raf|orf|rw2|pef|psd)$/i.test(a.name),
            ),
          );
        }}
        className={`border border-dashed px-6 py-10 text-center transition-colors ${
          sobreArea ? "border-tinta bg-superficie" : "border-linha-forte"
        }`}
      >
        <UploadCloud className="mx-auto size-6 text-tinta-3" aria-hidden />
        <p className="mt-3 text-sm text-tinta-2">Arraste aqui a pasta que você exportou do Lightroom</p>

        <input
          ref={inputRef}
          type="file"
          accept=".jpg,.jpeg,.tif,.tiff,image/jpeg,image/tiff"
          multiple
          className="sr-only"
          onChange={(e) => void receber(Array.from(e.target.files ?? []))}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          disabled={rodando}
          onClick={() => inputRef.current?.click()}
        >
          Escolher arquivos
        </Button>

        <p className="mt-5 font-hud text-xs text-tinta-3">
          JPEG ou TIFF. O arquivo sobe exatamente como está — sem reduzir e sem marca d&apos;água. É o que
          o cliente vai baixar.
        </p>
      </div>

      {(arquivos.length > 0 || recusados.length > 0 || repetidosNoDrop.length > 0) && (
        <div className="mt-5 flex flex-col gap-4 border border-linha bg-fundo p-4">
          <p className="font-hud text-sm text-tinta" aria-live="polite">
            <span className="tabular-nums">{escolhidas.length - conferencia.faltam.length}</span> de{" "}
            <span className="tabular-nums">{escolhidas.length}</span> escolhidas têm foto tratada
            {repetidos > 0 && <span className="text-tinta-3"> · {repetidos} já entregues</span>}
          </p>

          {conferencia.faltam.length > 0 && (
            <div>
              <p className="font-hud text-xs uppercase tracking-cine text-tinta-3">
                Faltam {conferencia.faltam.length}
              </p>
              <p className="mt-1 break-words font-hud text-xs text-tinta-2">
                {resumirNomes(conferencia.faltam)}
              </p>
              <p className="mt-1 text-xs text-tinta-3">
                Dá pra entregar assim e completar depois: volte aqui e suba o resto.
              </p>
            </div>
          )}

          {foraDeNovo.length > 0 && (
            <div className="border border-tinta-3 p-3">
              <p className="font-hud text-xs uppercase tracking-cine text-tinta">
                {foraDeNovo.length} {foraDeNovo.length === 1 ? "arquivo não está" : "arquivos não estão"} entre as
                escolhidas
              </p>
              <p className="mt-1 break-words font-hud text-xs text-tinta-2">{resumirNomes(foraDeNovo)}</p>
              <p className="mt-1 text-xs text-tinta-2">
                Pode ser a pasta de outro cliente. Por isso não sobem, a menos que você marque abaixo.
              </p>
              <label className="mt-2 flex items-center gap-2 text-sm text-tinta">
                <input
                  type="checkbox"
                  checked={incluirFora}
                  onChange={(e) => setIncluirFora(e.target.checked)}
                  className="size-4 accent-tinta"
                />
                Enviar mesmo assim
              </label>
            </div>
          )}

          {suspeitaDeOriginal && (
            <div role="alert" className="border border-tinta-3 p-3">
              <p className="font-hud text-xs uppercase tracking-cine text-tinta">
                Estes arquivos não parecem ter passado pelo Lightroom
              </p>
              <p className="mt-1 text-xs text-tinta-2">
                Os JPEGs não trazem sinal de editor. Se você arrastou a pasta do cartão em vez da
                exportação, está prestes a entregar os originais sem tratamento. Confira antes de enviar.
              </p>
            </div>
          )}

          {repetidosNoDrop.length > 0 && (
            <div role="alert" className="border border-tinta-3 p-3">
              <p className="font-hud text-xs uppercase tracking-cine text-tinta">
                Mesmo nome em mais de uma pasta ({repetidosNoDrop.length})
              </p>
              <p className="mt-1 break-words font-hud text-xs text-tinta-2">{resumirNomes(repetidosNoDrop)}</p>
              <p className="mt-1 text-xs text-tinta-2">
                Só o primeiro de cada nome foi considerado. O cliente baixa pelo nome do arquivo, então
                não dá para entregar dois com o mesmo. Arraste uma pasta só.
              </p>
            </div>
          )}

          {recusados.length > 0 && (
            <div>
              <p className="font-hud text-xs uppercase tracking-cine text-tinta-3">
                Formato não aceito ({recusados.length})
              </p>
              <p className="mt-1 break-words font-hud text-xs text-tinta-2">{resumirNomes(recusados)}</p>
              <p className="mt-1 text-xs text-tinta-3">
                Só JPEG e TIFF. RAW não é entrega: é o original, e ele continua no seu HD.
              </p>
            </div>
          )}

          {!rodando && (
            <div className="flex flex-wrap items-center gap-4">
              <Button type="button" onClick={enviar} disabled={!pendentes.length}>
                Enviar {pendentes.length} {pendentes.length === 1 ? "arquivo" : "arquivos"}
              </Button>
              <p className="font-hud text-xs text-tinta-3">
                {formatarBytes(pendentes.reduce((s, a) => s + a.size, 0))}
              </p>
            </div>
          )}
        </div>
      )}

      {rodando && (
        <div className="mt-5">
          <div className="flex items-baseline justify-between font-hud text-xs">
            <span className="flex items-center gap-2 text-tinta-2">
              <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
              {etapa}
            </span>
            <span className="text-tinta" aria-live="polite">
              {feitas} / {total}
            </span>
          </div>
          <div
            className="mt-2 h-1 w-full bg-superficie-2"
            role="progressbar"
            aria-valuenow={porcento}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Envio das fotos tratadas"
          >
            <div className="h-full bg-tinta transition-[width]" style={{ width: `${porcento}%` }} />
          </div>
          <p className="mt-2 font-hud text-xs text-tinta-3">
            Pode demorar com arquivos grandes. Não feche esta aba.
          </p>
        </div>
      )}

      {erroGeral && (
        <p role="alert" className="mt-4 font-hud text-xs text-rec-papel">
          {erroGeral}
        </p>
      )}

      {falhas.length > 0 && (
        <div role="alert" className="mt-4 border border-linha-forte p-4">
          <p className="font-hud text-xs uppercase tracking-cine text-rec-papel">
            {falhas.length} {falhas.length === 1 ? "falha" : "falhas"}
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {falhas.map((f) => (
              <li key={f.nome} className="break-words font-hud text-xs text-tinta-2">
                {f.nome} — {f.erro}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-tinta-3">Escolha a pasta de novo: sobe só o que falta.</p>
        </div>
      )}

      {terminou !== null && !rodando && terminou > 0 && (
        <p role="status" className="mt-4 font-hud text-xs text-tinta-2">
          {terminou} {terminou === 1 ? "arquivo subiu" : "arquivos subiram"}.
        </p>
      )}
    </div>
  );
}
