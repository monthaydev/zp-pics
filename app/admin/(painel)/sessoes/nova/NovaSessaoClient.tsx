"use client";

import Link from "next/link";
import { useActionState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { criar, type EstadoNovaSessao } from "./acoes";

const ESTADO_INICIAL: EstadoNovaSessao = { erros: {}, geral: null, valores: {} };

function Campo({
  id,
  rotulo,
  dica,
  erro,
  children,
}: {
  id: string;
  rotulo: string;
  dica?: string;
  erro?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{rotulo}</Label>
      {children}
      {/* O erro é texto ao lado do campo, não só a borda vermelha do input */}
      {erro ? (
        <p id={`${id}-erro`} className="font-body text-xs text-rec-papel">
          {erro}
        </p>
      ) : dica ? (
        <p className="font-body text-xs text-tinta-3">{dica}</p>
      ) : null}
    </div>
  );
}

/**
 * Um grupo do formulário.
 *
 * Oito campos empilhados numa coluna eram um paredão de retângulos iguais —
 * "nome do ensaio" e "senha da galeria" têm naturezas diferentes e não
 * pareciam. A numeração fica porque é uma sequência de verdade: é a ordem em
 * que o João tem essas informações na cabeça quando fecha um ensaio no
 * WhatsApp — primeiro o ensaio, depois quem é o cliente, depois o combinado.
 */
function Grupo({
  numero,
  titulo,
  children,
}: {
  numero: string;
  titulo: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="min-w-0 pt-6">
      <legend className="mb-6 flex w-full items-baseline gap-2 px-0">
        <span className="font-hud text-xs text-tinta-3">{numero}</span>
        <span className="font-body text-xs font-medium text-tinta-2">
          {titulo}
        </span>
      </legend>
      <div className="flex flex-col gap-6">{children}</div>
    </fieldset>
  );
}

export default function NovaSessaoClient() {
  const [estado, acao, pendente] = useActionState(criar, ESTADO_INICIAL);
  const { erros, valores } = estado;

  /** Amarra input, mensagem e estado de erro de um campo só. */
  const props = (nome: string) => ({
    id: nome,
    name: nome,
    defaultValue: valores[nome] ?? "",
    "aria-invalid": erros[nome] ? (true as const) : undefined,
    "aria-describedby": erros[nome] ? `${nome}-erro` : undefined,
  });

  return (
    <form action={acao} className="mt-10 flex flex-col gap-10">
      <Grupo numero="01" titulo="O ensaio">
        <Campo id="titulo" rotulo="Nome do ensaio" erro={erros.titulo}>
          <Input {...props("titulo")} required autoFocus placeholder="Ensaio Ana e Rafael" />
        </Campo>
        <Campo
          id="observacoes"
          rotulo="Observações"
          dica="Opcional, só você vê"
          erro={erros.observacoes}
        >
          <Textarea {...props("observacoes")} rows={2} />
        </Campo>
      </Grupo>

      <Grupo numero="02" titulo="O cliente">
        <div className="grid gap-6 sm:grid-cols-2">
          <Campo id="cliente_nome" rotulo="Cliente" erro={erros.cliente_nome}>
            <Input {...props("cliente_nome")} required placeholder="Ana Marques" />
          </Campo>

          <Campo
            id="cliente_whatsapp"
            rotulo="WhatsApp"
            dica="Opcional"
            erro={erros.cliente_whatsapp}
          >
            <Input {...props("cliente_whatsapp")} type="tel" placeholder="(11) 90000-0000" />
          </Campo>
        </div>

        <Campo
          id="cliente_email"
          rotulo="E-mail do cliente"
          dica="Opcional"
          erro={erros.cliente_email}
        >
          <Input {...props("cliente_email")} type="email" placeholder="ana@email.com" />
        </Campo>
      </Grupo>

      <Grupo numero="03" titulo="O combinado">
        <div className="grid gap-6 sm:grid-cols-2">
          <Campo
            id="fotos_incluidas"
            rotulo="Fotos no pacote"
            dica="Escolher além disso é permitido e conta como extra"
            erro={erros.fotos_incluidas}
          >
            <Input
              {...props("fotos_incluidas")}
              type="number"
              min={1}
              required
              defaultValue={valores.fotos_incluidas || "30"}
            />
          </Campo>

          <Campo
            id="prazo_dias"
            rotulo="Prazo (dias)"
            dica="Depois disso o cliente ainda vê as fotos, mas não escolhe"
            erro={erros.prazo_dias}
          >
            <Input
              {...props("prazo_dias")}
              type="number"
              min={1}
              required
              defaultValue={valores.prazo_dias || "15"}
            />
          </Campo>
        </div>

        {/*
          Campo de texto à vista, não `type="password"`: esta senha é ditada no
          WhatsApp, não é segredo de estado. Esconder atrapalha quem digita.
        */}
        <Campo
          id="senha"
          rotulo="Senha da galeria"
          dica="Curta e fácil de ditar. Vai junto com o link."
          erro={erros.senha}
        >
          <Input {...props("senha")} required placeholder="ana2026" />
        </Campo>
      </Grupo>

      {estado.geral && (
        <p aria-live="polite" className="font-body text-xs text-rec-papel">
          {estado.geral}
        </p>
      )}

      <div className="pt-6">
        <div className="flex items-center gap-3">
          <Button type="submit" size="lg" disabled={pendente}>
            {pendente ? "Criando…" : "Criar sessão"}
          </Button>
          <Button asChild variant="ghost" size="lg">
            <Link href="/admin">Cancelar</Link>
          </Button>
        </div>
        {/* O aviso mora colado no botão que ele explica, não solto no topo da
            página onde ninguém lê antes de preencher. */}
        <p className="mt-3 max-w-xl text-apoio leading-relaxed text-tinta-3">
          A sessão nasce em rascunho: o link já existe, mas não mostra nada pro
          cliente até você subir as fotos e abrir a galeria.
        </p>
      </div>
    </form>
  );
}
