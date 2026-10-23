"use client";

import { Download } from "lucide-react";

import BotaoCopiar from "@/components/BotaoCopiar";
import { Button } from "@/components/ui/button";

/**
 * O produto final do app, do lado da ZP.
 *
 * Uma foto por linha, sem numeração e sem separador: é o formato que o filtro
 * do Lightroom aceita colado direto. Qualquer enfeite aqui vira trabalho manual
 * pro João apagar depois.
 */
export default function ListaNomes({
  nomes,
  slug,
}: {
  nomes: string[];
  slug: string;
}) {
  const texto = nomes.join("\n");

  function baixar() {
    const url = URL.createObjectURL(new Blob([texto], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `selecao-${slug}.txt`;
    link.click();
    // Sem o revoke o blob fica preso na memória da aba até o reload.
    URL.revokeObjectURL(url);
  }

  return (
    <section>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto font-body text-xs font-medium text-tinta-3">
          Seleção do cliente · {nomes.length}{" "}
          {nomes.length === 1 ? "foto" : "fotos"}
        </h2>
        <BotaoCopiar texto={texto} rotulo="Copiar lista" />
        <Button type="button" variant="outline" size="sm" onClick={baixar}>
          <Download />
          Baixar .txt
        </Button>
      </div>

      <ul className="mt-4 max-h-96 overflow-y-auto border border-linha bg-superficie p-4 font-hud text-sm leading-relaxed">
        {nomes.map((nome) => (
          <li key={nome} className="break-all text-tinta">
            {nome}
          </li>
        ))}
      </ul>
    </section>
  );
}
