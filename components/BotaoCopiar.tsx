"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

/** Copia um texto e confirma na hora. Usado pro link que vai pro WhatsApp. */
export default function BotaoCopiar({
  texto,
  rotulo = "Copiar",
}: {
  texto: string;
  rotulo?: string;
}) {
  const [copiado, setCopiado] = useState(false);

  // Volta ao normal sozinho; o timer é limpo pra não escrever em componente
  // já desmontado se o João sair da página no meio dos 2s.
  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(false), 2000);
    return () => clearTimeout(t);
  }, [copiado]);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setCopiado(true);
        } catch {
          // Sem permissão de área de transferência (http, navegador antigo):
          // não trava nada, o texto está à vista pra seleção manual.
        }
      }}
    >
      {copiado ? <Check /> : <Copy />}
      {copiado ? "Copiado" : rotulo}
    </Button>
  );
}
