"use client";

import { UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { arquivosDoDrop, comConcorrencia, ehImagem, uuid } from "@/lib/arquivos";
import { comparaNomeNatural, gerarDerivativos } from "@/lib/imagem";

import { registrarFotos } from "./acoes";

/**
 * Tamanho do lote.
 *
 * O ensaio não é processado de uma vez: a cada 12 fotos o que já subiu é
 * gravado no banco. É o que faz a retomada existir — fechar a aba na foto 300
 * custa no máximo as 12 do lote em curso, não as 300.
 */
const LOTE = 12;

/** Uploads em voo. Cada foto são dois PUT (thumb e prévia), feitos em sequência. */
const CONCORRENCIA_UPLOAD = 6;

type Falha = { nomeOriginal: string; erro: string };

/**
 * Sobe um blob numa URL pré-assinada, com retentativa e mensagem que ensina.
 *
 * `fetch` rejeita por rede OU por CORS barrado — o navegador esconde de
 * propósito qual dos dois foi, e "Failed to fetch" sozinho não ensina nada
 * (foi a mensagem que se repetiu 400 vezes na carga que expôs o bug do CORS
 * do bucket R2, em 31/08/2026). 5xx e 429 são transitórios e valem retentar;
 * 4xx (URL vencida, malformada) não melhora tentando de novo.
 */
async function put(url: string, corpo: Blob, rotulo: string) {
  for (let tentativa = 1; ; tentativa += 1) {
    let resposta: Response;
    try {
      resposta = await fetch(url, {
        method: "PUT",
        body: corpo,
        // O Content-Type daqui é o que o R2 grava no objeto — e é o que a rota
        // `api/img` devolve depois. Sem ele o arquivo fica como
        // application/octet-stream e o navegador baixa em vez de exibir.
        headers: { "Content-Type": "image/webp" },
      });
    } catch {
      throw new Error(`${rotulo}: o navegador não alcançou o bucket (CORS do R2 ou rede)`);
    }
    if (resposta.ok) return;
    if (tentativa < 3 && (resposta.status >= 500 || resposta.status === 429)) {
      await new Promise((r) => setTimeout(r, 500 * tentativa));
      continue;
    }
    throw new Error(`${rotulo}: o bucket recusou — HTTP ${resposta.status}`);
  }
}

export default function UploadClient({
  sessaoId,
  jaEnviadas,
}: {
  sessaoId: string;
  /** O que já está no banco, com a posição de cada foto no ensaio. */
  jaEnviadas: { nome: string; ordem: number }[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [arquivos, setArquivos] = useState<File[]>([]);
  const [rodando, setRodando] = useState(false);
  const [feitas, setFeitas] = useState(0);
  // Progresso DENTRO do lote em geração — sem isto o contador ficava parado
  // durante os ~34 lotes de um ensaio de 400 fotos: `feitas` só avançava
  // depois que o lote inteiro (decodificar + redimensionar + marcar + subir +
  // registrar 12 fotos) terminava. Uma tela parada por dezenas de segundos é
  // indistinguível de uma tela travada.
  const [progressoLote, setProgressoLote] = useState({ concluidas: 0, total: 0 });
  const [etapa, setEtapa] = useState("");
  const [falhas, setFalhas] = useState<Falha[]>([]);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [sobreArea, setSobreArea] = useState(false);

  const ordemDoEnviado = new Map(jaEnviadas.map((f) => [f.nome, f.ordem]));
  const enviados = new Set(ordemDoEnviado.keys());
  const pendentes = arquivos.filter((a) => !enviados.has(a.name));
  const repetidos = arquivos.length - pendentes.length;

  const receber = (lista: File[]) => {
    setArquivos(lista.filter(ehImagem).sort((a, b) => comparaNomeNatural(a.name, b.name)));
    setFalhas([]);
    setErroGeral(null);
    setFeitas(0);
  };

  async function enviar() {
    if (!pendentes.length || rodando) return;

    setRodando(true);
    setFalhas([]);
    setErroGeral(null);
    setFeitas(0);
    setProgressoLote({ concluidas: 0, total: 0 });

    // A ordem é a da pasta inteira (inclusive o que já subiu), não a do lote:
    // o cliente precisa ver o ensaio na sequência em que foi fotografado.
    //
    // De onde esta pasta conta:
    // - Retomada (a pasta tem nome que já subiu): ancora no primeiro nome
    //   repetido — a ordem que ele tem no banco menos a posição dele na pasta.
    //   Assim a retomada de uma pasta adicional continua de onde ELA parou, e
    //   não do zero (o que intercalava com a primeira pasta).
    // - Pasta nova: depois da última foto da sessão. Antes recomeçava do zero
    //   e as fotos novas se misturavam com as antigas na galeria.
    const ancora = arquivos.findIndex((a) => ordemDoEnviado.has(a.name));
    const ordemLivre = jaEnviadas.reduce((maior, f) => Math.max(maior, f.ordem + 1), 0);
    const ancorada = ancora === -1 ? -1 : ordemDoEnviado.get(arquivos[ancora].name)! - ancora;
    // Âncora negativa = o nome repetido é coincidência de uma pasta nova (ele
    // está mais adiante na pasta do que no ensaio). Trata como pasta nova.
    const base = ancorada < 0 ? ordemLivre : ancorada;
    const ordemPorNome = new Map(arquivos.map((a, i) => [a.name, base + i]));
    const falhasLocais: Falha[] = [];
    let concluidas = 0;

    try {
      for (let inicio = 0; inicio < pendentes.length; inicio += LOTE) {
        const lote = pendentes.slice(inicio, inicio + LOTE);

        setEtapa("Gerando miniatura e prévia…");
        setProgressoLote({ concluidas: 0, total: lote.length });
        const { derivativos, falhas: erros } = await gerarDerivativos(lote, {
          aoProgredir: (p) => setProgressoLote({ concluidas: p.concluidas, total: p.total }),
        });
        // Reseta antes das próximas fases (autorizar/enviar/registrar) — elas
        // não têm progresso granular por foto, e deixar o valor antigo aqui
        // contaria a mesma foto duas vezes no contador visível.
        setProgressoLote({ concluidas: 0, total: 0 });
        if (erros.length) {
          falhasLocais.push(...erros);
          setFalhas([...falhasLocais]);
        }
        if (!derivativos.length) continue;

        // O id nasce aqui porque ele é o nome do objeto no bucket — precisamos
        // dele antes de pedir a URL assinada. `uuid()` porque
        // `crypto.randomUUID` some fora de contexto seguro (IP da LAN, como
        // se testa no celular) e derrubava a carga inteira.
        const comId = derivativos.map((d) => ({ ...d, foto_id: uuid() }));

        setEtapa("Pedindo autorização de upload…");
        const resposta = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessao_id: sessaoId, ids: comId.map((d) => d.foto_id) }),
        });
        if (!resposta.ok) {
          throw new Error("O servidor recusou o upload. Faça login de novo e tente outra vez.");
        }
        const { urls } = (await resposta.json()) as {
          urls: { foto_id: string; thumb: string; preview: string }[];
        };
        const porId = new Map(urls.map((u) => [u.foto_id, u]));

        setEtapa("Enviando…");
        const enviadas = await comConcorrencia(
          comId.map((d) => async () => {
            const alvo = porId.get(d.foto_id);
            if (!alvo) return null;
            try {
              // O Content-Type daqui é o que o R2 grava no objeto — e é o que a
              // rota `api/img` vai devolver depois. Sem ele o arquivo fica como
              // application/octet-stream e o navegador baixa em vez de exibir.
              // (Medido: o R2 não recusa o PUT se o tipo divergir do assinado.)
              await put(alvo.thumb, d.thumb, "miniatura");
              await put(alvo.preview, d.preview, "prévia");

              return d;
            } catch (e) {
              falhasLocais.push({
                nomeOriginal: d.nomeOriginal,
                erro: e instanceof Error ? e.message : "falha no envio",
              });
              return null;
            }
          }),
          CONCORRENCIA_UPLOAD,
        );

        const boas = enviadas.filter((d): d is NonNullable<typeof d> => d !== null);
        setFalhas([...falhasLocais]);
        // Se o PRIMEIRO lote falhou inteiro, não é foto ruim — é infra (quase
        // sempre CORS do bucket R2). Moer mais lotes só pra listar o mesmo erro
        // centenas de vezes é desperdício e esconde o diagnóstico numa parede
        // de texto.
        if (!boas.length) {
          if (inicio === 0) {
            throw new Error(
              "Nenhuma foto do primeiro lote subiu. Quase sempre é o CORS do bucket R2 " +
                "não estar liberando este endereço. Rode `node scripts/conferir-infra.mjs` " +
                "e confira a linha CORS.",
            );
          }
          continue;
        }

        setEtapa("Registrando…");
        const registro = await registrarFotos({
          sessao_id: sessaoId,
          fotos: boas.map((d) => ({
            foto_id: d.foto_id,
            nome_original: d.nomeOriginal,
            ordem: ordemPorNome.get(d.nomeOriginal) ?? 0,
            largura: d.largura,
            altura: d.altura,
          })),
        });
        if (!registro.ok) throw new Error(registro.erro ?? "Falha ao registrar as fotos.");

        concluidas += boas.length;
        setFeitas(concluidas);
      }

      setEtapa("");
      setArquivos([]);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch (e) {
      setErroGeral(e instanceof Error ? e.message : "Algo deu errado no upload.");
      setEtapa("");
      // Sem router.refresh() aqui não: o que já foi gravado precisa aparecer,
      // senão a retomada reprocessa lotes que já estão no banco.
      router.refresh();
    } finally {
      setRodando(false);
    }
  }

  const total = pendentes.length;
  // Soma o que o lote atual já processou (geração em andamento) ao que já foi
  // registrado — é o que faz a barra andar durante os ~30s de decodificar e
  // reencodar um lote, em vez de ficar parada até ele terminar inteiro.
  const feitasVisiveis = Math.min(total, feitas + progressoLote.concluidas);
  const porcento = total ? Math.round((feitasVisiveis / total) * 100) : 0;

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
          receber(await arquivosDoDrop(e.dataTransfer));
        }}
        className={`border border-dashed px-6 py-12 text-center transition-colors ${
          sobreArea ? "border-tinta bg-superficie" : "border-linha-forte"
        }`}
      >
        <UploadCloud className="mx-auto size-6 text-tinta-3" aria-hidden />

        <p className="mt-4 text-sm text-tinta-2">
          Arraste a pasta do ensaio aqui
        </p>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => receber(Array.from(e.target.files ?? []))}
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

        <p className="mt-6 font-body text-xs text-tinta-3">
          O arquivo original não sai da sua máquina. Sobem só a miniatura e a
          prévia com marca d&apos;água.
        </p>
      </div>

      {arquivos.length > 0 && !rodando && (
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <p className="font-hud text-xs text-tinta-2">
            {pendentes.length} para enviar
            {repetidos > 0 && (
              <span className="text-tinta-3"> · {repetidos} já enviadas</span>
            )}
          </p>
          <Button type="button" onClick={enviar} disabled={!pendentes.length}>
            Enviar {pendentes.length} fotos
          </Button>
        </div>
      )}

      {rodando && (
        <div className="mt-6">
          <div className="flex items-baseline justify-between font-hud text-xs">
            <span className="text-tinta-2">{etapa}</span>
            <span className="text-tinta" aria-live="polite">
              {feitasVisiveis} / {total}
            </span>
          </div>
          <div
            className="mt-2 h-1 w-full bg-superficie-2"
            role="progressbar"
            aria-valuenow={porcento}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full bg-tinta transition-[width]"
              style={{ width: `${porcento}%` }}
            />
          </div>
        </div>
      )}

      {erroGeral && (
        <p className="mt-4 font-body text-xs text-rec-papel" aria-live="polite">
          {erroGeral}
        </p>
      )}

      {falhas.length > 0 && (
        <div className="mt-6">
          <p className="font-body text-xs font-medium text-tinta-3">
            {falhas.length} não subiram
          </p>
          <ul className="mt-2 space-y-1">
            {falhas.map((f) => (
              <li key={f.nomeOriginal} className="font-hud text-xs text-tinta-2">
                {f.nomeOriginal} — {f.erro}
              </li>
            ))}
          </ul>
          <p className="mt-2 font-body text-xs text-tinta-3">
            Escolha a pasta de novo: só o que falta é reprocessado.
          </p>
        </div>
      )}
    </div>
  );
}
