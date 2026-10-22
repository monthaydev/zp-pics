"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CONFIG_PADRAO,
  RECOMENDACAO_MARCA,
  formatarBytes,
  gerarDerivativos,
  type ConfigDerivativos,
  type Derivativos,
  type FalhaDerivativo,
} from "@/lib/imagem";

type Linha = Derivativos & { urlPreview: string; urlThumb: string };

export default function LaboratorioClient() {
  const [config, setConfig] = useState<ConfigDerivativos>(CONFIG_PADRAO);
  const [comMarca, setComMarca] = useState(true);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [falhas, setFalhas] = useState<FalhaDerivativo[]>([]);
  const [progresso, setProgresso] = useState({ concluidas: 0, total: 0 });
  const [rodando, setRodando] = useState(false);
  const [msLote, setMsLote] = useState(0);
  const [aberta, setAberta] = useState<Linha | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const mudarMarca = <K extends keyof NonNullable<ConfigDerivativos["marca"]>>(
    campo: K,
    valor: NonNullable<ConfigDerivativos["marca"]>[K],
  ) =>
    setConfig((c) => ({ ...c, marca: c.marca ? { ...c.marca, [campo]: valor } : c.marca }));
  const urlsRef = useRef<string[]>([]);

  const limparUrls = useCallback(() => {
    urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    urlsRef.current = [];
  }, []);

  useEffect(() => limparUrls, [limparUrls]);

  const receberArquivos = (lista: FileList | null) => {
    if (!lista) return;
    const imagens = Array.from(lista).filter(
      (f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|hei[cf])$/i.test(f.name),
    );
    setArquivos(imagens);
    setLinhas([]);
    setFalhas([]);
    setMsLote(0);
    limparUrls();
  };

  const processar = async () => {
    if (!arquivos.length || rodando) return;
    setRodando(true);
    setLinhas([]);
    setFalhas([]);
    limparUrls();
    setProgresso({ concluidas: 0, total: arquivos.length });

    const inicio = performance.now();
    const { derivativos, falhas: erros } = await gerarDerivativos(arquivos, {
      config: { ...config, marca: comMarca ? config.marca : null },
      aoProgredir: (p) => setProgresso({ concluidas: p.concluidas, total: p.total }),
    });
    setMsLote(performance.now() - inicio);

    const prontas = derivativos.map((d) => {
      const urlPreview = URL.createObjectURL(d.preview);
      const urlThumb = URL.createObjectURL(d.thumb);
      urlsRef.current.push(urlPreview, urlThumb);
      return { ...d, urlPreview, urlThumb };
    });

    setLinhas(prontas);
    setFalhas(erros);
    setRodando(false);
  };

  const resumo = useMemo(() => {
    if (!linhas.length) return null;
    const original = linhas.reduce((s, l) => s + l.bytesOriginal, 0);
    const thumb = linhas.reduce((s, l) => s + l.thumb.size, 0);
    const preview = linhas.reduce((s, l) => s + l.preview.size, 0);
    const derivado = thumb + preview;
    const msMedio = linhas.reduce((s, l) => s + l.msTotal, 0) / linhas.length;
    const porFoto = derivado / linhas.length;
    return {
      original,
      derivado,
      thumb,
      preview,
      reducao: original > 0 ? (1 - derivado / original) * 100 : 0,
      msMedio,
      porFoto,
      // O ensaio de referência do plano. É este número que valida (ou derruba)
      // a premissa de custo do projeto inteiro.
      projecao400: porFoto * 400,
      segundos400: (msLote / linhas.length / 1000) * 400,
    };
  }, [linhas, msLote]);

  return (
    <div>
      <header className="mt-6 mb-10">
        <p className="font-hud text-xs uppercase tracking-cine text-tinta-3">
          ZP Pics · ferramenta interna
        </p>
        <h1 className="mt-2 font-display text-4xl uppercase tracking-cine">
          Bancada do motor de imagem
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-tinta-2">
          Jogue aqui uma pasta de um ensaio real. Nada sai da sua máquina — os
          arquivos são processados no navegador e nunca sobem. Serve pra medir
          o peso e o tempo antes de mexer em qualquer parâmetro, e pra decidir
          o ponto certo da marca d&apos;água olhando foto de verdade.
        </p>
      </header>

      {/* ---------- entrada ---------- */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          receberArquivos(e.dataTransfer.files);
        }}
        className="rounded-sm border border-dashed border-linha-forte bg-superficie px-6 py-10 text-center"
      >
        <p className="text-sm text-tinta-2">
          Arraste as fotos aqui, ou{" "}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-tinta underline underline-offset-4 hover:text-rec-papel"
          >
            escolha os arquivos
          </button>
          .
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => receberArquivos(e.target.files)}
        />
        {arquivos.length > 0 && (
          <p className="mt-4 font-hud text-sm text-tinta">
            {arquivos.length} arquivo{arquivos.length > 1 ? "s" : ""} ·{" "}
            {formatarBytes(arquivos.reduce((s, a) => s + a.size, 0))}
          </p>
        )}
      </div>

      {/* ---------- parâmetros ---------- */}
      <section className="mt-8 grid gap-6 sm:grid-cols-2">
        <fieldset className="rounded-sm border border-linha bg-superficie p-5">
          <legend className="px-2 font-hud text-xs uppercase tracking-cine text-tinta-3">
            Derivativos
          </legend>
          <Faixa
            rotulo="Prévia — lado maior"
            valor={config.preview.lado}
            min={800}
            max={2400}
            passo={100}
            sufixo="px"
            aoMudar={(v) =>
              setConfig((c) => ({ ...c, preview: { ...c.preview, lado: v } }))
            }
          />
          <Faixa
            rotulo="Prévia — qualidade"
            valor={config.preview.qualidade}
            min={0.4}
            max={0.95}
            passo={0.01}
            aoMudar={(v) =>
              setConfig((c) => ({ ...c, preview: { ...c.preview, qualidade: v } }))
            }
          />
          <Faixa
            rotulo="Miniatura — lado maior"
            valor={config.thumb.lado}
            min={200}
            max={800}
            passo={20}
            sufixo="px"
            aoMudar={(v) => setConfig((c) => ({ ...c, thumb: { ...c.thumb, lado: v } }))}
          />
          <Faixa
            rotulo="Miniatura — qualidade"
            valor={config.thumb.qualidade}
            min={0.4}
            max={0.95}
            passo={0.01}
            aoMudar={(v) =>
              setConfig((c) => ({ ...c, thumb: { ...c.thumb, qualidade: v } }))
            }
          />
        </fieldset>

        <fieldset className="rounded-sm border border-linha bg-superficie p-5">
          <legend className="px-2 font-hud text-xs uppercase tracking-cine text-tinta-3">
            Marca d&apos;água
          </legend>
          <label className="mb-4 flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={comMarca}
              onChange={(e) => setComMarca(e.target.checked)}
              className="size-4 accent-rec"
            />
            Aplicar na prévia
          </label>
          <label className="mb-4 block">
            <span className="font-hud text-xs uppercase tracking-cine text-tinta-3">
              Texto
            </span>
            <input
              value={config.marca?.texto ?? ""}
              onChange={(e) => mudarMarca("texto", e.target.value)}
              className="mt-1 w-full rounded-sm border border-linha bg-fundo px-3 py-2 font-hud text-sm"
            />
          </label>
          <label className="mb-4 block">
            <span className="font-hud text-xs uppercase tracking-cine text-tinta-3">
              Legenda (vazio desliga)
            </span>
            <input
              value={config.marca?.legenda ?? ""}
              onChange={(e) => mudarMarca("legenda", e.target.value)}
              className="mt-1 w-full rounded-sm border border-linha bg-fundo px-3 py-2 font-hud text-sm"
            />
          </label>
          <Faixa
            rotulo="Opacidade do mosaico"
            valor={config.marca?.opacidade ?? 0}
            min={0.04}
            max={0.3}
            passo={0.01}
            aoMudar={(v) => mudarMarca("opacidade", v)}
          />
          <Faixa
            rotulo="Tamanho no mosaico"
            valor={config.marca?.tamanhoFonte ?? 0}
            min={12}
            max={64}
            passo={2}
            sufixo="px"
            aoMudar={(v) => mudarMarca("tamanhoFonte", v)}
          />
          <Faixa
            rotulo="Espaçamento"
            valor={config.marca?.espacamento ?? 0}
            min={160}
            max={700}
            passo={20}
            sufixo="px"
            aoMudar={(v) => mudarMarca("espacamento", v)}
          />
          <Faixa
            rotulo="Ângulo"
            valor={config.marca?.anguloGraus ?? 0}
            min={-60}
            max={0}
            passo={1}
            sufixo="°"
            aoMudar={(v) => mudarMarca("anguloGraus", v)}
          />
          <Faixa
            rotulo="Assinatura central (0 desliga)"
            valor={config.marca?.tamanhoCentral ?? 0}
            min={0}
            max={260}
            passo={10}
            sufixo="px"
            aoMudar={(v) => mudarMarca("tamanhoCentral", v)}
          />
          <Faixa
            rotulo="Opacidade da central"
            valor={config.marca?.opacidadeCentral ?? 0}
            min={0}
            max={0.25}
            passo={0.01}
            aoMudar={(v) => mudarMarca("opacidadeCentral", v)}
          />
          <Faixa
            rotulo="Deformação por foto (0 desliga)"
            valor={config.marca?.deformacao ?? 0}
            min={0}
            max={16}
            passo={1}
            sufixo="px"
            aoMudar={(v) => mudarMarca("deformacao", v)}
          />
        </fieldset>
      </section>

      <Recomendacao
        atual={config}
        aoRestaurar={() => {
          setConfig(CONFIG_PADRAO);
          setComMarca(true);
        }}
      />

      <div className="mt-6 flex items-center gap-4">
        <button
          type="button"
          onClick={processar}
          disabled={!arquivos.length || rodando}
          className="rounded-sm bg-tinta px-6 py-3 font-hud text-xs uppercase tracking-cine text-fundo transition-colors hover:bg-rec hover:text-tinta disabled:cursor-not-allowed disabled:bg-superficie-2 disabled:text-tinta-3"
        >
          {rodando ? "Processando…" : "Processar"}
        </button>
        {rodando && (
          <p className="font-hud text-sm text-tinta-2" aria-live="polite">
            {progresso.concluidas} / {progresso.total}
          </p>
        )}
      </div>

      {rodando && (
        <div className="mt-4 h-px w-full bg-superficie-2">
          <div
            className="h-px bg-rec transition-all"
            style={{
              width: `${progresso.total ? (progresso.concluidas / progresso.total) * 100 : 0}%`,
            }}
          />
        </div>
      )}

      {/* ---------- resumo ---------- */}
      {resumo && (
        <section className="mt-10 grid gap-px overflow-hidden rounded-sm border border-linha bg-superficie-2 sm:grid-cols-2 lg:grid-cols-4">
          <Numero rotulo="Originais" valor={formatarBytes(resumo.original)} />
          <Numero
            rotulo="O que subiria"
            valor={formatarBytes(resumo.derivado)}
            destaque
          />
          <Numero rotulo="Redução" valor={`${resumo.reducao.toFixed(1)}%`} destaque />
          <Numero rotulo="Média por foto" valor={formatarBytes(resumo.porFoto)} />
          <Numero
            rotulo="Ensaio de 400 fotos"
            valor={formatarBytes(resumo.projecao400)}
            nota="projeção de armazenamento"
          />
          <Numero
            rotulo="Tempo de 400 fotos"
            valor={`${(resumo.segundos400 / 60).toFixed(1)} min`}
            nota="projeção nesta máquina"
          />
          <Numero rotulo="Média por foto" valor={`${resumo.msMedio.toFixed(0)} ms`} />
          <Numero rotulo="Lote completo" valor={`${(msLote / 1000).toFixed(1)} s`} />
        </section>
      )}

      {falhas.length > 0 && (
        <section className="mt-8 rounded-sm border border-rec/40 bg-superficie p-5">
          <h2 className="font-hud text-xs uppercase tracking-cine text-rec-papel">
            {falhas.length} falha{falhas.length > 1 ? "s" : ""}
          </h2>
          <ul className="mt-3 space-y-1">
            {falhas.map((f) => (
              <li key={f.nomeOriginal} className="font-hud text-xs text-tinta-2">
                {f.nomeOriginal} — {f.erro}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------- resultado ---------- */}
      {linhas.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 font-hud text-xs uppercase tracking-cine text-tinta-3">
            Clique numa foto pra ver a prévia no tamanho real e julgar a marca
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {linhas.map((l) => (
              <button
                key={l.nomeOriginal}
                type="button"
                onClick={() => setAberta(l)}
                className="group text-left"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={l.urlThumb}
                  alt={l.nomeOriginal}
                  width={l.largura}
                  height={l.altura}
                  className="aspect-square w-full rounded-sm object-cover"
                />
                <p className="mt-1 truncate font-hud text-[10px] text-tinta-3 group-hover:text-tinta">
                  {l.nomeOriginal}
                </p>
                <p className="font-hud text-[10px] text-tinta-2">
                  {formatarBytes(l.preview.size)} · {formatarBytes(l.thumb.size)}
                </p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ---------- inspeção ---------- */}
      {aberta && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Prévia de ${aberta.nomeOriginal}`}
          onClick={() => setAberta(null)}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-fundo/95 p-6"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={aberta.urlPreview}
            alt={aberta.nomeOriginal}
            className="max-h-[80vh] max-w-full object-contain"
          />
          <p className="font-hud text-xs text-tinta-2">
            {aberta.nomeOriginal} · {aberta.larguraOriginal}×{aberta.alturaOriginal} →{" "}
            {aberta.largura}×{aberta.altura} · {formatarBytes(aberta.bytesOriginal)} →{" "}
            {formatarBytes(aberta.preview.size)} · {aberta.msTotal.toFixed(0)} ms
          </p>
          <p className="font-hud text-[10px] uppercase tracking-cine text-tinta-3">
            clique pra fechar
          </p>
        </div>
      )}
    </div>
  );
}

function Faixa({
  rotulo,
  valor,
  min,
  max,
  passo,
  sufixo,
  aoMudar,
}: {
  rotulo: string;
  valor: number;
  min: number;
  max: number;
  passo: number;
  sufixo?: string;
  aoMudar: (v: number) => void;
}) {
  return (
    <label className="mb-4 block">
      <span className="flex items-baseline justify-between">
        <span className="font-hud text-xs uppercase tracking-cine text-tinta-3">
          {rotulo}
        </span>
        <span className="font-hud text-sm text-tinta">
          {passo < 1 ? valor.toFixed(2) : valor}
          {sufixo}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={passo}
        value={valor}
        onChange={(e) => aoMudar(Number(e.target.value))}
        className="mt-2 w-full accent-rec"
      />
    </label>
  );
}

function Numero({
  rotulo,
  valor,
  nota,
  destaque,
}: {
  rotulo: string;
  valor: string;
  nota?: string;
  destaque?: boolean;
}) {
  return (
    <div className="bg-superficie p-5">
      <p className="font-hud text-[10px] uppercase tracking-cine text-tinta-3">
        {rotulo}
      </p>
      <p
        className={`mt-1 font-display text-2xl tracking-cine ${
          destaque ? "text-rec-papel" : "text-tinta"
        }`}
      >
        {valor}
      </p>
      {nota && <p className="mt-1 font-hud text-[10px] text-tinta-2">{nota}</p>}
    </div>
  );
}

/** Os parâmetros que a caixa de recomendação compara, na ordem dos controles. */
const PARAMETROS_MARCA: {
  campo: keyof typeof RECOMENDACAO_MARCA;
  rotulo: string;
  formatar: (v: number) => string;
}[] = [
  { campo: "opacidade", rotulo: "Opacidade do mosaico", formatar: (v) => `${Math.round(v * 100)}%` },
  { campo: "tamanhoFonte", rotulo: "Tamanho no mosaico", formatar: (v) => `${v}px` },
  { campo: "espacamento", rotulo: "Espaçamento", formatar: (v) => `${v}px` },
  { campo: "anguloGraus", rotulo: "Ângulo", formatar: (v) => `${v}°` },
  { campo: "tamanhoCentral", rotulo: "Assinatura central", formatar: (v) => (v ? `${v}px` : "desligada") },
  { campo: "opacidadeCentral", rotulo: "Opacidade da central", formatar: (v) => `${Math.round(v * 100)}%` },
  { campo: "deformacao", rotulo: "Deformação por foto", formatar: (v) => (v ? `${v}px` : "desligada") },
];

/**
 * A caixa de recomendação.
 *
 * O laboratório abre na configuração recomendada, e os uploads de verdade usam
 * sempre ela (`CONFIG_PADRAO` em `lib/imagem.ts`) — mexer aqui é testar, não
 * mudar o produto. A caixa diz qual é o recomendado, o porquê de cada número, e
 * aponta o que está diferente agora, para quem mexeu saber do que se afastou.
 */
function Recomendacao({
  atual,
  aoRestaurar,
}: {
  atual: ConfigDerivativos;
  aoRestaurar: () => void;
}) {
  const recomendada = CONFIG_PADRAO.marca!;
  const marca = atual.marca;
  const textosDiferem =
    !marca || marca.texto !== recomendada.texto || marca.legenda !== recomendada.legenda;
  const diferentes =
    PARAMETROS_MARCA.filter(({ campo }) => !marca || marca[campo] !== recomendada[campo]).length +
    (textosDiferem ? 1 : 0);

  return (
    <section
      aria-labelledby="titulo-recomendacao"
      className="mt-6 rounded-sm border border-linha-forte bg-superficie p-5"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2
            id="titulo-recomendacao"
            className="font-hud text-xs uppercase tracking-cine text-tinta-3"
          >
            Configuração recomendada da marca d&apos;água
          </h2>
          <p className="mt-1 text-sm text-tinta-2">
            {diferentes === 0
              ? "Você está na recomendação. É ela que os uploads usam."
              : `${diferentes} ${diferentes === 1 ? "ajuste difere" : "ajustes diferem"} da recomendação. Os uploads continuam usando a recomendação — aqui é só teste.`}
          </p>
        </div>
        <button
          type="button"
          onClick={aoRestaurar}
          disabled={diferentes === 0}
          className="rounded-sm border border-linha-forte px-4 py-2 font-hud text-xs uppercase tracking-cine text-tinta transition-colors hover:bg-superficie-2 disabled:cursor-default disabled:text-tinta-3 disabled:hover:bg-transparent"
        >
          Voltar à recomendação
        </button>
      </header>

      <p className="mt-4 font-hud text-sm text-tinta">
        &ldquo;{recomendada.texto}&rdquo; em Anton
        {recomendada.legenda ? <> · legenda &ldquo;{recomendada.legenda}&rdquo; em mono</> : null}
      </p>

      <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {PARAMETROS_MARCA.map(({ campo, rotulo, formatar }) => {
          const valorAtual = marca ? marca[campo] : null;
          const igual = valorAtual === recomendada[campo];
          return (
            <div key={campo} className="border-t border-linha pt-3">
              <dt className="flex items-baseline justify-between gap-3">
                <span className="font-hud text-xs uppercase tracking-cine text-tinta-3">
                  {rotulo}
                </span>
                <span className="font-hud text-sm tabular-nums text-tinta">
                  {formatar(recomendada[campo])}
                  {!igual && valorAtual !== null && (
                    <span className="ml-2 text-tinta-2">(agora {formatar(valorAtual)})</span>
                  )}
                </span>
              </dt>
              <dd className="mt-1 text-xs leading-relaxed text-tinta-2">
                {RECOMENDACAO_MARCA[campo]}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
