"use client";

import { ChevronLeft, ChevronRight, Heart, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { FotoDaGaleria } from "@/lib/galeria";
import { cn } from "@/lib/utils";

type Props = {
  fotos: FotoDaGaleria[];
  indice: number;
  escolhidas: Set<string>;
  travada: boolean;
  aoAlternar: (fotoId: string) => void;
  aoNavegar: (indice: number) => void;
  aoFechar: () => void;
};

/**
 * A tela onde a decisão acontece de verdade.
 *
 * É aqui que a prévia grande — a única com marca d'água — é carregada, e só sob
 * demanda: pré-carregar as 400 jogaria fora a economia de banda que sustenta o
 * projeto. Carrega a foto aberta e os dois vizinhos, porque quem está
 * escolhendo anda de seta e não pode esperar a rede a cada passo.
 *
 * O teclado é o caminho principal: seta anda, espaço escolhe, esc fecha. Quem
 * escolhe 400 fotos no mouse desiste na metade.
 */
export default function Lightbox({
  fotos,
  indice,
  escolhidas,
  travada,
  aoAlternar,
  aoNavegar,
  aoFechar,
}: Props) {
  const foto = fotos[indice];
  const caixa = useRef<HTMLDivElement>(null);
  const focoAnterior = useRef<HTMLElement | null>(null);

  /**
   * Qual foto já terminou de baixar.
   *
   * Guardar o id, e não um booleano, é o que evita ter que zerar o estado num
   * efeito a cada troca de foto — o "carregando" sai da comparação, não de um
   * `setState` extra a cada navegação.
   */
  const [carregada, setCarregada] = useState<string | null>(null);
  const carregando = foto ? carregada !== foto.id : false;

  const escolhida = foto ? escolhidas.has(foto.id) : false;

  const anterior = useCallback(() => {
    if (indice > 0) aoNavegar(indice - 1);
  }, [indice, aoNavegar]);

  const proxima = useCallback(() => {
    if (indice < fotos.length - 1) aoNavegar(indice + 1);
  }, [indice, fotos.length, aoNavegar]);

  // Devolve o foco pra grade ao fechar: sem isso quem usa teclado volta pro
  // topo da página e perde o lugar no meio de um ensaio de 400 fotos.
  useEffect(() => {
    focoAnterior.current = document.activeElement as HTMLElement | null;
    caixa.current?.focus();

    const anteriorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = anteriorOverflow;
      focoAnterior.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent) {
      switch (evento.key) {
        case "Escape":
          evento.preventDefault();
          aoFechar();
          break;
        case "ArrowLeft":
          evento.preventDefault();
          anterior();
          break;
        case "ArrowRight":
          evento.preventDefault();
          proxima();
          break;
        case " ":
        case "Enter":
          // `preventDefault` sempre: sem ele o espaço rola a página por baixo e
          // ainda dispara o botão que estiver com o foco, marcando duas vezes.
          evento.preventDefault();
          if (!travada && foto) aoAlternar(foto.id);
          break;
        case "Tab": {
          // Prende o foco na caixa — atrás dela tem uma grade com 800 botões.
          const alvos = caixa.current?.querySelectorAll<HTMLElement>("button");
          if (!alvos?.length) return;
          const primeiro = alvos[0];
          const ultimo = alvos[alvos.length - 1];
          if (evento.shiftKey && document.activeElement === primeiro) {
            evento.preventDefault();
            ultimo.focus();
          } else if (!evento.shiftKey && document.activeElement === ultimo) {
            evento.preventDefault();
            primeiro.focus();
          }
          break;
        }
      }
    }

    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [anterior, proxima, aoFechar, aoAlternar, foto, travada]);

  // Vizinhos em cache. Só dois: é o que a navegação por seta alcança antes de a
  // rede responder, e pré-carregar mais vira download de ensaio inteiro.
  useEffect(() => {
    for (const vizinho of [fotos[indice - 1], fotos[indice + 1]]) {
      if (!vizinho) continue;
      const img = new Image();
      img.src = `/api/img/${vizinho.key_preview}`;
    }
  }, [fotos, indice]);

  if (!foto) return null;

  const legenda = `${foto.nome_original}, foto ${indice + 1} de ${fotos.length}`;

  return (
    <div
      ref={caixa}
      role="dialog"
      aria-modal="true"
      aria-label={legenda}
      tabIndex={-1}
      // Escuro nos dois temas, e isso não é preferência: é aqui que o cliente
      // julga exposição e cor. A mesma foto contra papel claro parece mais
      // escura e mais contrastada do que é, e a escolha sai errada. Os papéis
      // são definidos por seletor de atributo justamente para uma subárvore
      // conseguir se declarar assim.
      data-tema="escuro"
      className="lightbox-entra fixed inset-0 z-50 flex flex-col bg-fundo text-tinta outline-none"
    >
      <header className="flex items-center gap-4 border-b border-linha px-4 py-3">
        {/* Número de quadro + nome, no mesmo formato da folha de contato — o
            cliente não deveria ter que traduzir entre as duas telas. Nome de
            arquivo é sempre mono: é identificador técnico, e o cliente vai
            ler ele em voz alta pro fotógrafo no WhatsApp. */}
        <p className="flex min-w-0 flex-1 items-baseline gap-2 truncate font-hud text-xs">
          <span className="shrink-0 tabular-nums text-tinta-3">
            {String(indice + 1).padStart(3, "0")}
          </span>
          <span className="truncate text-tinta">{foto.nome_original}</span>
        </p>
        <p className="font-hud text-xs text-tinta-3">
          {indice + 1} / {fotos.length}
        </p>
        <button
          type="button"
          onClick={aoFechar}
          aria-label="Fechar"
          className="flex size-11 items-center justify-center text-tinta-2 transition-colors hover:text-tinta"
        >
          <X className="size-5" />
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1 items-center justify-center p-2 sm:p-6">
        {carregando && (
          <p className="absolute font-body text-xs font-medium text-tinta-3">
            carregando…
          </p>
        )}

        {/* eslint-disable-next-line @next/next/no-img-element -- a prévia já sai
            do navegador do admin no tamanho e no formato finais; o otimizador da
            Vercel cobraria por uma transformação que não muda nada. */}
        <img
          // `key` força a troca da imagem na navegação: sem ele o React reusa o
          // mesmo <img> e a foto anterior fica na tela até a nova baixar.
          key={foto.id}
          src={`/api/img/${foto.key_preview}`}
          alt={legenda}
          onLoad={() => setCarregada(foto.id)}
          draggable={false}
          className={cn(
            // Sem a duração explícita a foto nova aparecia seca no lugar da
            // anterior, e navegar de seta virava um pisca-pisca preto.
            "max-h-full max-w-full object-contain transition-opacity duration-200 ease-out",
            carregando ? "opacity-0" : "opacity-100",
          )}
        />

        <BotaoLado
          lado="esquerda"
          desabilitado={indice === 0}
          aoClicar={anterior}
        />
        <BotaoLado
          lado="direita"
          desabilitado={indice === fotos.length - 1}
          aoClicar={proxima}
        />
      </div>

      <footer className="flex items-center justify-center gap-4 border-t border-linha px-4 py-3">
        {travada ? (
          <p className="font-body text-xs text-tinta-3">
            {escolhida ? "Escolhida" : "Não escolhida"}
          </p>
        ) : (
          <button
            type="button"
            onClick={() => aoAlternar(foto.id)}
            aria-pressed={escolhida}
            className={cn(
              "flex h-11 items-center gap-3 border px-5 font-body text-sm transition-[colors,transform] duration-150 active:scale-[0.98]",
              escolhida
                ? "border-rec text-rec-papel"
                : "border-linha-forte text-tinta hover:border-tinta-2",
            )}
          >
            <Heart
              className={cn(
                // Mesmo pulo do coração da grade: é o mesmo gesto, tem que dar
                // a mesma resposta.
                "size-4 transition-transform duration-[260ms] ease-[cubic-bezier(0.34,1.56,0.64,1)]",
                escolhida ? "scale-110 fill-rec" : "scale-100",
              )}
            />
            {escolhida ? "Escolhida" : "Escolher"}
            <span className="font-hud text-[0.6875rem] text-tinta-3">espaço</span>
          </button>
        )}
      </footer>
    </div>
  );
}

function BotaoLado({
  lado,
  desabilitado,
  aoClicar,
}: {
  lado: "esquerda" | "direita";
  desabilitado: boolean;
  aoClicar: () => void;
}) {
  const Icone = lado === "esquerda" ? ChevronLeft : ChevronRight;

  return (
    <button
      type="button"
      onClick={aoClicar}
      disabled={desabilitado}
      aria-label={lado === "esquerda" ? "Foto anterior" : "Próxima foto"}
      className={cn(
        "absolute inset-y-0 flex w-14 items-center justify-center text-tinta-2 transition-colors hover:text-tinta disabled:pointer-events-none disabled:opacity-0",
        lado === "esquerda" ? "left-0" : "right-0",
      )}
    >
      <Icone className="size-7" />
    </button>
  );
}
