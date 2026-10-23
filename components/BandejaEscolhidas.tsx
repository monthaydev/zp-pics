"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";

import type { FotoDaGaleria } from "@/lib/galeria";

type Props = {
  /** As escolhidas, já na ordem do ensaio, com a posição de cada uma nele. */
  escolhidas: { foto: FotoDaGaleria; posicao: number }[];
  travada: boolean;
  /** Leva a grade até a foto e põe o foco nela. */
  aoIr: (fotoId: string) => void;
  /** Tira a foto da seleção — o mesmo gesto do coração, pelo outro lado. */
  aoTirar: (fotoId: string) => void;
};

/**
 * A bandeja: as escolhidas, em miniatura, presas ao rodapé.
 *
 * Escolhida pelo João em 22/10/2026 (`prototipos/galeria/v2.html`, desenho do
 * interface). Responde à pergunta que o cliente faz o tempo todo numa
 * seleção de 30 entre 400 — "o que eu já tenho?" —, sem trocar de tela nem
 * esconder a grade com o filtro. Três fotos da mesma pose saltam à vista aqui
 * e não saltam na grade.
 *
 * Custa zero de rede a mais: são as mesmas miniaturas que a grade já baixou, e
 * o navegador serve do cache (a rota `api/img` responde 304).
 */
export default function BandejaEscolhidas({ escolhidas, travada, aoIr, aoTirar }: Props) {
  const fita = useRef<HTMLUListElement>(null);
  const anteriores = useRef<Set<string> | null>(null);

  // Quando entra uma foto nova, a fita anda até ela — é a confirmação de que a
  // escolha entrou no conjunto. Resposta a um clique do cliente, nunca
  // movimento sozinho; no primeiro render (galeria reaberta) não anda.
  useEffect(() => {
    const atuais = new Set(escolhidas.map((e) => e.foto.id));
    const antes = anteriores.current;
    anteriores.current = atuais;
    if (!antes) return;
    const nova = escolhidas.find((e) => !antes.has(e.foto.id));
    if (!nova) return;
    fita.current
      ?.querySelector<HTMLElement>(`[data-bandeja="${nova.foto.id}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [escolhidas]);

  if (escolhidas.length === 0) {
    return (
      <p className="py-3 font-body text-hud text-tinta-3">
        As fotos que você marcar aparecem aqui, para ver o conjunto.
      </p>
    );
  }

  return (
    <ul
      ref={fita}
      aria-label="Fotos escolhidas"
      className="flex gap-2.5 overflow-x-auto pb-3 pt-1 [scrollbar-width:thin]"
    >
      {escolhidas.map(({ foto, posicao }) => {
        const quadro = String(posicao).padStart(3, "0");
        return (
          <li key={foto.id} data-bandeja={foto.id} className="relative flex shrink-0 flex-col items-center gap-1">
            <button
              type="button"
              onClick={() => aoIr(foto.id)}
              aria-label={`Ir para ${foto.nome_original}, foto ${posicao}`}
              // A moldura `rec` é a mesma da grade: marca escolhida, que é a
              // única função dela. Altura fixa, largura pela proporção — foto em
              // pé fica estreita, não cortada.
              style={{ aspectRatio: `${foto.largura} / ${foto.altura}` }}
              className="block h-13 overflow-hidden bg-superficie-2 shadow-[inset_0_0_0_2px_var(--color-rec)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- mesma
                  miniatura da grade, direto da nossa rota (ver CartaoFoto). */}
              <img
                src={`/api/img/${foto.key_thumb}`}
                alt=""
                loading="lazy"
                decoding="async"
                draggable={false}
                className="size-full object-cover p-0.5"
              />
            </button>
            <span aria-hidden className="font-hud text-quadronum tabular-nums text-tinta-3">
              {quadro}
            </span>
            {!travada && (
              <button
                type="button"
                onClick={() => aoTirar(foto.id)}
                aria-label={`Tirar ${foto.nome_original} da seleção`}
                // Fora do Tab: com 30 escolhidas seriam 60 paradas no rodapé,
                // o problema que o roving tabindex resolveu na grade. Quem usa
                // teclado desmarca pela grade (espaço); o × é atalho de toque.
                tabIndex={-1}
                // Dentro da miniatura: a fita rola na horizontal, e quem rola
                // num eixo recorta o outro — um × saindo pra cima sumiria.
                // 24px, o mínimo do WCAG 2.5.8 para alvo de toque.
                className="absolute right-0 top-0 flex size-6 items-center justify-center bg-black/75 text-white transition-opacity hover:opacity-80"
              >
                <X className="size-4" aria-hidden />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
