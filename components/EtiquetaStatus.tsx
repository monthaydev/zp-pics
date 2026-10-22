import type { StatusSessao } from "@/lib/schemas";
import { cn } from "@/lib/utils";

/**
 * Status da sessão.
 *
 * O rótulo é sempre texto — a diferença entre os estados nunca fica só na cor.
 * `rec` não entra aqui: ele tem dono no projeto (foto escolhida e foco), e
 * status de sessão não é nenhum dos dois.
 */
const ESTILOS: Record<StatusSessao, string> = {
  // Ainda sem fotos: contorno tracejado diz "incompleto" sem precisar de cor
  rascunho: "border-dashed border-linha-forte text-tinta-3",
  aberta: "border-tinta-2 text-tinta",
  // Fechada e entregue: preenchida, é o estado "pronto"
  finalizada: "border-tinta bg-tinta text-fundo",
  expirada: "border-linha text-tinta-3 line-through",
  // Entregue: contorno forte sobre fundo suave — fechou, e mandou. Diferente da
  // finalizada (preenchida) porque o trabalho da ZP acabou, não só o do cliente.
  entregue: "border-tinta bg-superficie-2 text-tinta",
  // Arquivada: apagada de vista, sem riscar. Riscado é do prazo vencido.
  arquivada: "border-linha text-tinta-3",
};

const ROTULOS: Record<StatusSessao, string> = {
  rascunho: "rascunho",
  aberta: "aberta",
  finalizada: "finalizada",
  expirada: "expirada",
  entregue: "entregue",
  arquivada: "arquivada",
};

export default function EtiquetaStatus({ status }: { status: StatusSessao }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center border px-2 py-0.5 font-hud text-[0.6875rem] uppercase tracking-cine",
        ESTILOS[status],
      )}
    >
{ROTULOS[status]}
    </span>
  );
}
