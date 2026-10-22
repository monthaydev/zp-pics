"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";

import BandejaEscolhidas from "@/components/BandejaEscolhidas";
import BarraSelecao from "@/components/BarraSelecao";
import CartaoFoto from "@/components/CartaoFoto";
import ConfirmarFinalizacao from "@/components/ConfirmarFinalizacao";
import Lightbox from "@/components/Lightbox";
import { cn } from "@/lib/utils";
import type { FotoDaGaleria } from "@/lib/galeria";

import { alternarSelecao, finalizarSelecao } from "./acoes";

type Props = {
  slug: string;
  fotos: FotoDaGaleria[];
  escolhidasIniciais: string[];
  fotosIncluidas: number;
  /** Finalizada ou expirada: a grade continua visível, só não aceita escolha. */
  travada: boolean;
};

type Filtro = "todas" | "escolhidas";

export default function GaleriaClient({
  slug,
  fotos,
  escolhidasIniciais,
  fotosIncluidas,
  travada,
}: Props) {
  const router = useRouter();
  const [escolhidas, setEscolhidas] = useState(() => new Set(escolhidasIniciais));
  /**
   * Espelho síncrono de `escolhidas`, atualizado no mesmo instante em que
   * `setEscolhidas` é chamado, nunca dentro do updater.
   *
   * Bug sofrido aqui: o padrão de ler uma variável de fora atribuída dentro do
   * callback de `setEscolhidas` (`let desejada; setEscolhidas(prev => {
   * desejada = ...; return prox })`) parte do princípio de que React chama
   * esse callback de forma síncrona, na hora. Não chama sempre — o primeiro
   * clique em cada foto mandava `escolhida:false` pro servidor (a leitura
   * acontecia antes do callback rodar), e a seleção nunca era salva. Só
   * apareceu testando de verdade num navegador com reload — é exatamente o
   * durante testes de fluxo de ponta a ponta.
   * Esta ref garante que `alternar` sempre lê o estado anterior de verdade,
   * sem depender de quando o React decide processar o setState.
   */
  const escolhidasRef = useRef(escolhidas);
  const [aviso, setAviso] = useState<string | null>(null);
  /** Índice da foto aberta no lightbox (no ensaio inteiro), ou `null` com ele
   * fechado. */
  const [aberta, setAberta] = useState<number | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [finalizando, setFinalizando] = useState(false);
  const [erroFinal, setErroFinal] = useState<string | null>(null);

  /**
   * "Todas" ou "Escolhidas" — a revisão final, antes do `Finalizar`.
   *
   * Sem isto, conferir 30 escolhidas entre 400 era rolar a grade inteira
   * caçando molduras. É filtro puro no cliente: os dados já estão na tela,
   * não há rede nova nenhuma.
   */
  const [filtro, setFiltro] = useState<Filtro>("todas");

  const visiveis = useMemo(() => {
    const comIndice = fotos.map((foto, indice) => ({ foto, indice }));
    if (filtro === "todas") return comIndice;
    // A foto desmarcada não some debaixo do dedo: ela continua na tela até a
    // próxima troca de filtro (regra 6 do produto — nunca esmaecer nem sumir
    // o que já foi visto), então o filtro relê `escolhidas` a cada render, não
    // congela a lista no momento em que foi aberto.
    return comIndice.filter(({ foto }) => escolhidas.has(foto.id));
  }, [fotos, filtro, escolhidas]);

  /**
   * Última intenção registrada por foto.
   *
   * Clicar duas vezes rápido dispara duas chamadas, e a segunda pode responder
   * antes da primeira. Sem isto, a falha de uma chamada velha reverteria uma
   * escolha nova que já tinha dado certo.
   */
  const intencoes = useRef(new Map<string, boolean>());

  /** Última foto marcada por clique direto (não por faixa) — a âncora de onde
   * o Shift+clique conta o intervalo. */
  const ultimaAlternada = useRef<string | null>(null);

  const salvar = useCallback(
    async (fotoIds: string[], desejada: boolean) => {
      for (const id of fotoIds) intencoes.current.set(id, desejada);

      // Bug sofrido (diagnóstico de 14/09, C1): a rede caindo — túnel, 4G
      // fraco — faz a Server Action REJEITAR em vez de devolver `ok:false`.
      // Sem tratar isso a foto ficava pintada como escolhida sem estar salva:
      // o cliente marcava 10, o banco tinha 0, e ele fechava a aba feliz.
      //
      // Rejeitar não quer dizer "não salvou" — a resposta pode ter se perdido
      // depois de o banco gravar. Por isso tenta de novo antes de desfazer:
      // marcar e desmarcar são idempotentes, repetir a mesma intenção é seguro.
      // Se mesmo assim a tela e o banco divergirem, `finalizarSelecao` recusa
      // (compara a contagem) antes do passo que não volta.
      let resultado: { ok: boolean; erro?: string } = { ok: false };
      for (const espera of [0, 600, 1800]) {
        if (espera) await new Promise((r) => setTimeout(r, espera));
        // Uma intenção mais nova para estas fotos já está a caminho: esta
        // chamada perdeu a vez, não insiste.
        if (fotoIds.every((id) => intencoes.current.get(id) !== desejada)) return;
        try {
          resultado = await comPrazo(
            alternarSelecao({ slug, foto_ids: fotoIds, escolhida: desejada }),
          );
          break;
        } catch {
          resultado = {
            ok: false,
            // O Next despacha actions em fila: uma que ficou pendurada pode
            // segurar as próximas. Recarregar zera a fila.
            erro: "Sem conexão. A marcação foi desfeita — se continuar, recarregue a página.",
          };
        }
      }

      if (resultado.ok) return;

      // Só desfaz as fotos cuja última intenção ainda é esta. Uma que o
      // cliente já clicou de novo tem uma chamada mais nova a caminho, e
      // reverter aqui apagaria a escolha nova.
      const aDesfazer = fotoIds.filter((id) => intencoes.current.get(id) === desejada);
      if (aDesfazer.length === 0) return;

      // Deu errado: desfaz e conta a verdade. Nunca deixar a tela dizer que
      // salvou quando não salvou. Escreve na ref primeiro — é ela que decide
      // a próxima intenção — e só então manda o React repintar.
      const proxima = new Set(escolhidasRef.current);
      for (const id of aDesfazer) {
        if (desejada) proxima.delete(id);
        else proxima.add(id);
      }
      escolhidasRef.current = proxima;
      setEscolhidas(proxima);
      setAviso(resultado.erro ?? "Não deu pra salvar. Tente de novo.");
    },
    [slug],
  );

  const alternar = useCallback(
    // `comFaixa` opcional: o Lightbox chama `alternar` sem o segundo
    // argumento (não tem Shift no teclado dele), e o clique direto na grade
    // também não passa nada quando não é Shift+clique.
    (fotoId: string, comFaixa = false) => {
      if (travada) return;

      // Shift+clique: marca (nunca desmarca — é um gesto de adicionar, não de
      // alternar em massa) todo o intervalo entre a última foto tocada e
      // esta, na ordem do ensaio inteiro, não da lista filtrada.
      const faixa: string[] = [];
      if (comFaixa && ultimaAlternada.current) {
        const de = fotos.findIndex((f) => f.id === ultimaAlternada.current);
        const ate = fotos.findIndex((f) => f.id === fotoId);
        if (de !== -1 && ate !== -1) {
          const [inicio, fim] = de < ate ? [de, ate] : [ate, de];
          for (let i = inicio; i <= fim; i++) faixa.push(fotos[i].id);
        }
      }
      // A ref, não o `setEscolhidas`, decide a intenção — ver o comentário na
      // declaração de `escolhidasRef`.
      const desejada = faixa.length > 0 ? true : !escolhidasRef.current.has(fotoId);

      // Na faixa, só vai o que muda de estado. Mandar as já escolhidas junto
      // fazia uma faixa que falhasse "desescolher" na tela fotos que estavam
      // escolhidas antes dela — e que continuavam escolhidas no banco.
      const alvos =
        faixa.length > 0 ? faixa.filter((id) => !escolhidasRef.current.has(id)) : [fotoId];
      if (alvos.length === 0) {
        ultimaAlternada.current = fotoId;
        return;
      }

      const proxima = new Set(escolhidasRef.current);
      for (const id of alvos) {
        if (desejada) proxima.add(id);
        else proxima.delete(id);
      }
      escolhidasRef.current = proxima;
      setEscolhidas(proxima);

      ultimaAlternada.current = fotoId;
      setAviso(null);

      // Otimista: pinta na hora, salva depois. A faixa vai numa chamada só: o
      // Next 16 despacha Server Actions em fila por aba, e uma por foto fazia
      // a faixa de 100 levar ~30 s pra salvar a última.
      void salvar(alvos, desejada);
    },
    [travada, fotos, salvar],
  );

  const abrir = useCallback((indice: number) => setAberta(indice), []);
  const fechar = useCallback(() => setAberta(null), []);

  /**
   * Roving tabindex: um único cartão fica no caminho do Tab, e as setas andam
   * pela grade. É o que torna a regra "teclado é primeira classe" verdadeira
   * fora do lightbox — tabular por 400 fotos são 800 paradas.
   *
   * `focado` é a posição dentro de `visiveis`, não do ensaio inteiro — as
   * setas andam pelo que está na tela agora.
   */
  const lista = useRef<HTMLUListElement>(null);
  const [focado, setFocado] = useState(0);

  // Trocar de filtro muda o que está visível; sem isto o `focado` de uma
  // lista de 400 ficaria fora da faixa de uma lista de 12. Ajuste de estado
  // durante o render — o mesmo padrão de `BarraSelecao` para "reagir a uma
  // prop que mudou" — e não um `useEffect`, que pintaria o cartão errado como
  // focado antes de corrigir num segundo render. `useState`, não `useRef`:
  // ref não é seguro de ler durante o render.
  const [filtroAnterior, setFiltroAnterior] = useState(filtro);
  if (filtroAnterior !== filtro) {
    setFiltroAnterior(filtro);
    if (focado !== 0) setFocado(0);
  }

  const focar = useCallback(
    (indice: number) => {
      const alvo = Math.max(0, Math.min(visiveis.length - 1, indice));
      setFocado(alvo);
      // O foco vem do DOM e não de um ref por cartão: guardar 400 refs pra
      // mover um foco é caro à toa, e o `focus()` já rola até o item — inclusive
      // os que o `content-visibility` ainda não desenhou.
      lista.current
        ?.querySelector<HTMLElement>(`[data-cartao="${alvo}"]`)
        ?.focus();
    },
    [visiveis.length],
  );

  /** As escolhidas na ordem do ensaio, com a posição de cada uma — a bandeja. */
  const naBandeja = useMemo(
    () =>
      fotos.flatMap((foto, indice) =>
        escolhidas.has(foto.id) ? [{ foto, posicao: indice + 1 }] : [],
      ),
    [fotos, escolhidas],
  );

  /**
   * Da bandeja para a grade: rola até a foto e põe o foco nela, para o
   * teclado continuar dali. `block: "center"` e não o rolar do `focus()`: o
   * rodapé fixo (contador + bandeja) cobre a última fileira, e uma foto
   * levada só até a borda de baixo ficaria escondida atrás dele.
   */
  const irPara = useCallback(
    (fotoId: string) => {
      const alvo = visiveis.findIndex(({ foto }) => foto.id === fotoId);
      if (alvo === -1) return;
      setFocado(alvo);
      const cartao = lista.current?.querySelector<HTMLElement>(`[data-cartao="${alvo}"]`);
      cartao?.scrollIntoView({ block: "center" });
      cartao?.focus({ preventScroll: true });
    },
    [visiveis],
  );

  const tirar = useCallback(
    (fotoId: string) => {
      if (escolhidasRef.current.has(fotoId)) alternar(fotoId);
    },
    [alternar],
  );

  function aoTeclarNaGrade(evento: React.KeyboardEvent<HTMLUListElement>) {
    const atual = Number((evento.target as HTMLElement).dataset?.cartao);
    // Sem `data-cartao` a tecla veio do botão do coração, que segue o
    // comportamento padrão de botão.
    if (!Number.isInteger(atual)) return;

    // Quantas colunas o grid tem agora — é responsivo (2 no celular, 5 no
    // monitor), então perguntar ao layout é o único jeito de a seta pra baixo
    // cair na foto de baixo mesmo.
    const colunas =
      lista.current
        ? getComputedStyle(lista.current).gridTemplateColumns.split(" ").filter(Boolean)
            .length || 1
        : 1;

    switch (evento.key) {
      case "ArrowRight":
        evento.preventDefault();
        focar(atual + 1);
        break;
      case "ArrowLeft":
        evento.preventDefault();
        focar(atual - 1);
        break;
      case "ArrowDown":
        evento.preventDefault();
        focar(atual + colunas);
        break;
      case "ArrowUp":
        evento.preventDefault();
        focar(atual - colunas);
        break;
      case "Home":
        evento.preventDefault();
        focar(0);
        break;
      case "End":
        evento.preventDefault();
        focar(visiveis.length - 1);
        break;
      case " ":
        // Espaço escolhe sem sair do cartão; Enter continua abrindo. Sem o
        // `preventDefault` o espaço acionaria o botão (abrindo o lightbox) e
        // ainda rolaria a página.
        //
        // Com a galeria travada não há o que escolher, e aí o espaço volta a
        // ser o que sempre foi: rolar a página.
        if (travada) return;
        evento.preventDefault();
        alternar(visiveis[atual].foto.id, evento.shiftKey);
        break;
    }
  }

  async function finalizar() {
    setFinalizando(true);
    setErroFinal(null);

    let resultado: { ok: boolean; erro?: string };
    try {
      // Prazo largo: a finalização espera 1,5 s de propósito e apaga centenas
      // de objetos do bucket.
      resultado = await comPrazo(
        finalizarSelecao({ slug, escolhidas_esperadas: escolhidasRef.current.size }),
        45_000,
      );
    } catch {
      // Sem isto a rede caindo no clique deixava o modal preso em
      // "Finalizando…" com os dois botões desabilitados até recarregar.
      // Não dá pra afirmar "nada foi apagado": a resposta pode ter se perdido
      // depois de o servidor finalizar. Recarregar mostra a verdade.
      resultado = {
        ok: false,
        erro: "A conexão caiu antes da resposta. Recarregue a página para ver se a seleção foi finalizada.",
      };
    }

    if (!resultado.ok) {
      setErroFinal(resultado.erro ?? "Não deu pra finalizar. Tente de novo.");
      setFinalizando(false);
      return;
    }

    // Sem desligar o `finalizando`: a navegação leva a tela embora, e reabilitar
    // o botão nesse meio-tempo abriria espaço pra um segundo clique.
    router.replace(`/s/${slug}/resumo`);
  }

  return (
    <>
      {/* Faixa de revisão, grudada no topo assim que a página rola — é o que
          faltava pro momento mais crítico do fluxo, o instante antes de
          `Finalizar`. Filtro puro no cliente: os dados já estão na tela. */}
      <div className="sticky top-0 z-30 -mx-4 flex gap-1 border-b border-linha bg-fundo/95 px-4 py-2 sm:-mx-6 sm:px-6">
        <BotaoFiltro
          rotulo="Todas"
          contagem={fotos.length}
          ativo={filtro === "todas"}
          aoClicar={() => setFiltro("todas")}
        />
        <BotaoFiltro
          rotulo="Escolhidas"
          contagem={escolhidas.size}
          ativo={filtro === "escolhidas"}
          aoClicar={() => setFiltro("escolhidas")}
        />
      </div>

      {filtro === "escolhidas" && visiveis.length === 0 ? (
        <p className="mt-secao text-center text-corpo text-tinta-2">
          Nenhuma foto escolhida ainda. Marque o coração das fotos que você
          quer receber tratadas.
        </p>
      ) : (
        /*
          `items-start` é o que preserva o enquadramento: sem ele o item
          estica até a altura da fileira, a proporção do banco é ignorada e a
          foto sai cortada. Fileira desencontrada é o preço de mostrar a foto
          inteira — e numa ferramenta de escolha, cortar o enquadramento é
          pior. A calha (`gap`) é a base do filme entre os quadros; na grade
          densa ela encolhe, mas não some.
        */
        <ul
          ref={lista}
          onKeyDown={aoTeclarNaGrade}
          // Folha densa (galeria v2, escolhida pelo João em 22/10/2026): 3
          // colunas no celular até 8 no monitor largo — uma dobra mostra 24 a
          // 32 quadros, e a triagem de 400 fica mais curta. O `pb-40 sm:pb-64` abre
          // espaço para o rodapé com a bandeja (menor no celular, onde ela nasce
          // recolhida).
          className="mt-bloco grid grid-cols-3 items-start gap-x-1.5 gap-y-3 pb-40 sm:grid-cols-4 sm:pb-64 sm:gap-x-2.5 sm:gap-y-4 lg:grid-cols-6 xl:grid-cols-8"
        >
          {visiveis.map(({ foto, indice: original }, indiceVisivel) => (
            <CartaoFoto
              key={foto.id}
              foto={foto}
              posicao={original + 1}
              total={fotos.length}
              indice={indiceVisivel}
              escolhida={escolhidas.has(foto.id)}
              travada={travada}
              ativo={indiceVisivel === focado}
              aoAlternar={alternar}
              aoAbrir={() => abrir(original)}
              aoFocar={() => setFocado(indiceVisivel)}
            />
          ))}
        </ul>
      )}

      <BarraSelecao
        escolhidas={escolhidas.size}
        incluidas={fotosIncluidas}
        aviso={aviso}
        bandeja={
          <BandejaEscolhidas
            escolhidas={naBandeja}
            travada={travada}
            aoIr={irPara}
            aoTirar={tirar}
          />
        }
        acao={
          travada ? null : (
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              disabled={escolhidas.size === 0}
              // Desabilitado com zero escolhas: finalizar assim apagaria o
              // ensaio inteiro, e é sempre engano.
              title={
                escolhidas.size === 0 ? "Escolha pelo menos uma foto." : undefined
              }
              // Primário sólido — o mesmo peso do botão `Entrar` da tela de
              // senha. É a ação que fecha o produto; antes era um contorno de
              // 40px encostado na barra, o elemento mais quieto da tela.
              className="h-12 shrink-0 bg-tinta px-6 font-body text-sm font-medium uppercase tracking-cine text-fundo transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-linha-forte disabled:text-tinta-3 disabled:opacity-100"
            >
              Finalizar
            </button>
          )
        }
      />

      {confirmando && (
        <ConfirmarFinalizacao
          escolhidas={escolhidas.size}
          incluidas={fotosIncluidas}
          aDescartar={fotos.length - escolhidas.size}
          enviando={finalizando}
          erro={erroFinal}
          aoConfirmar={finalizar}
          aoCancelar={() => setConfirmando(false)}
        />
      )}

      {aberta !== null && (
        <Lightbox
          fotos={fotos}
          indice={aberta}
          escolhidas={escolhidas}
          travada={travada}
          aoAlternar={alternar}
          aoNavegar={setAberta}
          aoFechar={fechar}
        />
      )}
    </>
  );
}

/**
 * Uma Server Action com prazo.
 *
 * Medido no Chrome em 22/10/2026, com a rede cortada: o POST falha na hora
 * (`ERR_INTERNET_DISCONNECTED`), mas a promessa da action às vezes NÃO
 * rejeita — fica pendente para sempre. Sem prazo, a foto ficava pintada como
 * escolhida sem estar salva, exatamente o bug que o `catch` deveria fechar.
 * Resposta fora do formato também conta como falha.
 */
const PRAZO_ACAO_MS = 8000;

function comPrazo<T extends { ok: boolean }>(acao: Promise<T>, prazoMs = PRAZO_ACAO_MS): Promise<T> {
  return new Promise<T>((resolver, rejeitar) => {
    const relogio = setTimeout(() => rejeitar(new Error("sem resposta")), prazoMs);
    acao.then(
      (valor) => {
        clearTimeout(relogio);
        if (valor && typeof valor.ok === "boolean") resolver(valor);
        else rejeitar(new Error("resposta inválida"));
      },
      (erro) => {
        clearTimeout(relogio);
        rejeitar(erro);
      },
    );
  });
}

function BotaoFiltro({
  rotulo,
  contagem,
  ativo,
  aoClicar,
}: {
  rotulo: string;
  contagem: number;
  ativo: boolean;
  aoClicar: () => void;
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      aria-pressed={ativo}
      className={cn(
        "flex h-9 items-center gap-2 border px-3 font-hud text-hud uppercase tracking-cine transition-colors",
        ativo
          ? "border-tinta text-tinta"
          : "border-transparent text-tinta-3 hover:text-tinta-2",
      )}
    >
      {rotulo}
      <span className="tabular-nums text-tinta-3">{contagem}</span>
    </button>
  );
}
