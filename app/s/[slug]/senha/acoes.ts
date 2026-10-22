"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";

import {
  BLOQUEIO_MINUTOS,
  limparTentativasDeSenha,
  obterSessaoParaSenha,
  registrarFalhaDeSenha,
} from "@/lib/galeria";
import { esquemaSenha } from "@/lib/schemas";
import { gravarCracha } from "@/lib/sessao-cliente";

/**
 * `tentativa` não é usado por nenhuma regra — é só para a tela.
 *
 * Errar a senha duas vezes seguidas devolve a mesma string, e o React, vendo o
 * mesmo texto, reusa o nó e não reanima nada: a segunda tentativa parecia não
 * ter respondido. Um contador que sempre muda dá ao componente uma `key` nova
 * a cada resposta.
 */
export type EstadoSenha = { erro: string | null; tentativa: number };

/**
 * Depois que o prazo vence, o crachá ainda vale por mais um tempo.
 *
 * Não vence junto com o prazo de propósito: a regra do produto é que prazo
 * vencido esconde o botão de escolher, não a galeria. Derrubar o acesso na
 * virada do prazo jogaria o cliente na tela de senha — onde a mesma senha ainda
 * funciona, então não protegeria nada e só daria trabalho.
 */
const CORTESIA_DIAS = 30;

/**
 * Troca a senha do ensaio por um crachá assinado.
 *
 * A mensagem de erro é sempre a mesma, sem distinguir senha errada de qualquer
 * outra recusa. E a tentativa é contada na sessão: o `slug` circula no WhatsApp
 * e tem que se assumir público.
 */
export async function verificarSenha(
  anterior: EstadoSenha,
  dados: FormData,
): Promise<EstadoSenha> {
  const analise = esquemaSenha.safeParse({
    slug: dados.get("slug"),
    senha: dados.get("senha"),
  });

  const tentativa = anterior.tentativa + 1;

  if (!analise.success)
    return { erro: "Digite a senha do seu ensaio.", tentativa };

  const { slug, senha } = analise.data;
  const sessao = await obterSessaoParaSenha(slug);
  if (!sessao) return { erro: "Senha incorreta.", tentativa };

  const bloqueio = sessao.bloqueado_ate ? new Date(sessao.bloqueado_ate) : null;
  if (bloqueio && bloqueio.getTime() > Date.now()) {
    const minutos = Math.max(1, Math.ceil((bloqueio.getTime() - Date.now()) / 60_000));
    return {
      erro: `Muitas tentativas. Espere ${minutos} min e tente de novo.`,
      tentativa,
    };
  }

  const confere = await bcrypt.compare(senha, sessao.senha_hash);

  if (!confere) {
    const { bloqueadoAte } = await registrarFalhaDeSenha(sessao);
    return {
      erro: bloqueadoAte
        ? `Senha incorreta. Espere ${BLOQUEIO_MINUTOS} min antes de tentar de novo.`
        : "Senha incorreta.",
      tentativa,
    };
  }

  await limparTentativasDeSenha(sessao.id);

  const prazo = new Date(sessao.prazo_em).getTime();
  const validade = Math.max(prazo, Date.now()) + CORTESIA_DIAS * 86_400_000;

  await gravarCracha({
    sessaoId: sessao.id,
    slug,
    exp: Math.floor(validade / 1000),
  });

  // Fora de try/catch: `redirect` funciona lançando uma exceção que o Next
  // intercepta — engolir ela deixaria o cliente parado na tela de senha.
  redirect(`/s/${slug}`);
}
