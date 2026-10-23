import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { exigirAdmin } from "@/lib/auth";

import NovaSessaoClient from "./NovaSessaoClient";

export const metadata: Metadata = { title: "Nova sessão · ZP Pics" };

export default async function NovaSessaoPage() {
  await exigirAdmin();

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link
        href="/admin"
        className="inline-flex items-center gap-2 font-body text-xs font-medium text-tinta-3 transition-colors hover:text-tinta"
      >
        <ArrowLeft className="size-3.5" />
        Sessões
      </Link>

      <h1 className="mt-6 font-display text-secao uppercase tracking-cine">
        Nova sessão
      </h1>

      {/* O aviso do rascunho — "o link não mostra nada pro cliente ainda" —
          mora agora colado no botão `Criar sessão`, no fim do formulário: é lá
          que ele é lido, não aqui em cima antes de preencher nada. */}
      <NovaSessaoClient />
    </div>
  );
}
