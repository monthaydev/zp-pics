"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatarTamanho } from "@/lib/utils";

import {
  arquivarSessao,
  concluirEntrega,
  desarquivarSessao,
  estenderEntrega,
  removerEntrega,
  type ResultadoEntrega,
} from "./entrega-acoes";

/**
 * Os botões da entrega e do arquivamento, num arquivo só: todos fazem a mesma
 * coisa — chamam uma action, mostram o erro se der, e o Next atualiza a tela
 * sozinho (as actions revalidam o painel).
 */

function useAcao() {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, comecar] = useTransition();
  const rodar = (fn: () => Promise<ResultadoEntrega>) => {
    setErro(null);
    comecar(async () => {
      const r = await fn();
      if (!r.ok) setErro(r.erro ?? "Não deu certo.");
    });
  };
  return { erro, pendente, rodar };
}

function Erro({ texto }: { texto: string | null }) {
  return texto ? (
    <p role="alert" className="mt-2 font-body text-xs text-rec-papel">
      {texto}
    </p>
  ) : null;
}

/** Fecha a entrega: a sessão vira "entregue" e os 30 dias começam a contar. */
export function ConcluirEntrega({ sessaoId, total }: { sessaoId: string; total: number }) {
  const [dias, setDias] = useState("30");
  const { erro, pendente, rodar } = useAcao();

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex w-32 flex-col gap-1.5">
          <Label htmlFor="dias-entrega">Disponível por (dias)</Label>
          <Input
            id="dias-entrega"
            type="number"
            min={1}
            max={365}
            value={dias}
            onChange={(e) => setDias(e.target.value)}
          />
        </div>
        <Button
          type="button"
          disabled={pendente || total === 0}
          onClick={() => rodar(() => concluirEntrega({ sessao_id: sessaoId, dias }))}
        >
          {pendente ? "Concluindo…" : `Concluir entrega (${total} ${total === 1 ? "arquivo" : "arquivos"})`}
        </Button>
      </div>
      <p className="mt-2 text-xs text-tinta-3">
        Depois de concluir, você ganha o texto pronto para mandar pelo Gmail e pelo WhatsApp. Passado o
        prazo, os arquivos saem do servidor sozinhos.
      </p>
      <Erro texto={erro} />
    </div>
  );
}

/** Mais prazo para o cliente, enquanto os arquivos ainda estão lá. */
export function EstenderEntrega({ sessaoId }: { sessaoId: string }) {
  const { erro, pendente, rodar } = useAcao();
  return (
    <div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pendente}
        onClick={() => rodar(() => estenderEntrega({ sessao_id: sessaoId, dias: 30 }))}
      >
        {pendente ? "Estendendo…" : "Estender por mais 30 dias"}
      </Button>
      <Erro texto={erro} />
    </div>
  );
}

/**
 * "Não vou enviar por aqui" — e também o arquivar de depois de entregar.
 * Nada é apagado: a sessão sai da frente e fica na aba Arquivadas.
 */
export function BotaoArquivar({ sessaoId, rotulo }: { sessaoId: string; rotulo: string }) {
  const { erro, pendente, rodar } = useAcao();
  return (
    <div>
      <Button
        type="button"
        variant="outline"
        disabled={pendente}
        onClick={() => rodar(() => arquivarSessao({ sessao_id: sessaoId }))}
      >
        {pendente ? "Arquivando…" : rotulo}
      </Button>
      <Erro texto={erro} />
    </div>
  );
}

export function BotaoDesarquivar({ sessaoId }: { sessaoId: string }) {
  const { erro, pendente, rodar } = useAcao();
  return (
    <div>
      <Button
        type="button"
        variant="outline"
        disabled={pendente}
        onClick={() => rodar(() => desarquivarSessao({ sessao_id: sessaoId }))}
      >
        {pendente ? "Desarquivando…" : "Desarquivar"}
      </Button>
      <Erro texto={erro} />
    </div>
  );
}

/** O que já foi entregue, com o × de tirar a que subiu errada. */
export function ListaEntregues({
  sessaoId,
  itens,
}: {
  sessaoId: string;
  itens: { id: string; nome: string; tamanho: number; apagada: boolean }[];
}) {
  const { erro, pendente, rodar } = useAcao();
  if (itens.length === 0) return null;

  const ativos = itens.filter((i) => !i.apagada);
  return (
    <div>
      <p className="font-body text-xs font-medium text-tinta-3">
        {ativos.length} {ativos.length === 1 ? "arquivo" : "arquivos"} ·{" "}
        {formatarTamanho(ativos.reduce((s, i) => s + i.tamanho, 0))}
      </p>
      <ul className="mt-2 max-h-64 divide-y divide-linha overflow-y-auto border border-linha">
        {itens.map((i) => (
          <li key={i.id} className="flex items-center gap-3 px-3 py-1.5">
            <span className={`min-w-0 flex-1 truncate font-hud text-xs ${i.apagada ? "text-tinta-3 line-through" : "text-tinta-2"}`}>
              {i.nome}
            </span>
            <span className="shrink-0 font-hud text-xs tabular-nums text-tinta-3">
              {i.apagada ? "saiu do servidor" : formatarTamanho(i.tamanho)}
            </span>
            {!i.apagada && (
              <button
                type="button"
                disabled={pendente}
                onClick={() => rodar(() => removerEntrega({ sessao_id: sessaoId, entrega_id: i.id }))}
                aria-label={`Tirar ${i.nome} da entrega`}
                // 36px de alvo: é ação destrutiva, e no celular 22px era fácil de errar.
                className="grid size-9 shrink-0 place-items-center text-tinta-3 transition-colors hover:text-tinta disabled:opacity-50"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            )}
          </li>
        ))}
      </ul>
      <Erro texto={erro} />
    </div>
  );
}
