import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { exigirAdmin } from "@/lib/auth";

import LaboratorioClient from "./LaboratorioClient";

/**
 * Bancada de medição do motor de imagem.
 *
 * Só existe em desenvolvimento — é ferramenta de calibragem, não faz parte do
 * produto. Antes de mexer em qualquer parâmetro de `lib/imagem.ts`, meça aqui
 * com fotos reais de um ensaio.
 *
 * Vive dentro do grupo `(painel)` — antes vivia fora dele e a tela ficava sem
 * cabeçalho, sem nav, sem jeito de sair a não ser o botão voltar do navegador.
 */
export default async function LaboratorioPage() {
  if (process.env.NODE_ENV === "production") notFound();
  await exigirAdmin();

  return (
    <div className="mx-auto w-full max-w-6xl">
      <Link
        href="/admin"
        className="inline-flex items-center gap-2 font-hud text-xs uppercase tracking-cine text-tinta-3 transition-colors hover:text-tinta"
      >
        <ArrowLeft className="size-3.5" />
        Sessões
      </Link>

      <LaboratorioClient />
    </div>
  );
}
