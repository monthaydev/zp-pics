import type { Metadata } from "next";

import MarcaZP from "@/components/MarcaZP";

import LoginClient from "./LoginClient";

export const metadata: Metadata = { title: "Entrar · ZP Pics" };

export default async function LoginPage({
  searchParams,
}: PageProps<"/admin/login">) {
  const { de } = await searchParams;

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-10 px-6 py-16">
      <header className="flex flex-col items-center gap-2 text-center">
        <MarcaZP tamanho={64} className="mb-3" />
        <h1 className="font-display text-secao uppercase tracking-cine">ZP Pics</h1>
        <p className="font-body text-xs font-medium text-tinta-3">
          Painel do estúdio
        </p>
      </header>

      <LoginClient de={typeof de === "string" ? de : "/admin"} />
    </main>
  );
}
