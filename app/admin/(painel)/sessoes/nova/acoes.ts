"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { exigirAdmin } from "@/lib/auth";
import { esquemaSessao } from "@/lib/schemas";
import { criarSessao } from "@/lib/sessoes";

export type EstadoNovaSessao = {
  erros: Record<string, string>;
  geral: string | null;
  /**
   * Devolvidos para repovoar o formulário. O React 19 limpa `<form>` depois da
   * action, e obrigar o João a redigitar oito campos por causa de um e-mail
   * torto é jeito certo de fazer ele voltar pro Selpics.
   */
  valores: Record<string, string>;
};

/*
 * O estado inicial mora no componente, não aqui.
 *
 * Num módulo `"use server"` todo export vira referência de Server Action, e o
 * Next só sabe empacotar função: uma constante exportada daqui chega no
 * navegador como `undefined`. O sintoma era a tela de criar sessão morrer com
 * "Cannot read properties of undefined (reading 'titulo')" — mas só no build de
 * produção, o que fazia ela parecer sã em `next dev`. O login sempre fez do
 * jeito certo; esta tela é que tinha fugido do padrão.
 */

export async function criar(
  _anterior: EstadoNovaSessao,
  dados: FormData,
): Promise<EstadoNovaSessao> {
  // Server Action é um POST aberto: o proxy redirecionar quem não tem sessão
  // não impede ninguém de chamar isto direto. Quem barra de verdade é esta linha.
  await exigirAdmin();

  const brutos = Object.fromEntries(
    ["titulo", "cliente_nome", "cliente_email", "cliente_whatsapp", "fotos_incluidas", "prazo_dias", "senha", "observacoes"].map(
      (campo) => [campo, String(dados.get(campo) ?? "")],
    ),
  );

  const analise = esquemaSessao.safeParse(brutos);

  if (!analise.success) {
    const porCampo = z.flattenError(analise.error).fieldErrors;
    const erros: Record<string, string> = {};
    for (const [campo, mensagens] of Object.entries(porCampo)) {
      if (mensagens?.[0]) erros[campo] = mensagens[0];
    }
    return { erros, geral: null, valores: brutos };
  }

  let id: string;
  try {
    id = await criarSessao(analise.data);
  } catch (erro) {
    return {
      erros: {},
      geral: erro instanceof Error ? erro.message : "Não foi possível criar a sessão.",
      valores: brutos,
    };
  }

  // Fora do try: `redirect` funciona lançando uma exceção de controle de fluxo,
  // e um catch por perto a engoliria — o clássico "salvou mas não navegou".
  redirect(`/admin/sessoes/${id}`);
}
