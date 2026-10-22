"use client";

import { Mail, MessageCircle } from "lucide-react";
import { useState } from "react";

import BotaoCopiar from "@/components/BotaoCopiar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  assuntoConvite,
  assuntoEntrega,
  linkGmail,
  linkMailto,
  linkWhatsApp,
  mensagemConvite,
  mensagemEntrega,
} from "@/lib/mensagens";

type Comum = {
  titulo: string;
  clienteNome: string;
  clienteEmail: string | null;
  whatsapp: string | null;
  link: string;
};

type Props =
  | (Comum & { tipo: "convite"; prazo: string })
  | (Comum & { tipo: "entrega"; ate: string; quantidade: number });

/**
 * A mensagem que vai para o cliente — o convite para escolher, ou o aviso de
 * que as tratadas estão prontas — com os dois caminhos de envio lado a lado.
 *
 * Os dois botões abrem o aplicativo da própria ZP já preenchido: o WhatsApp
 * com o texto, o Gmail com destinatário, assunto e corpo. A mensagem sai do
 * Gmail e do WhatsApp de vocês, e não de um robô: o cliente reconhece quem
 * mandou e a resposta cai na caixa certa. Nada disso passa pelo servidor.
 *
 * A senha é digitada aqui e some ao sair da tela: ela nunca foi guardada em
 * lugar nenhum além do hash, e essa foi decisão explícita do projeto. O campo
 * existe só pra montar o texto.
 */
export default function MensagemCliente(props: Props) {
  const [senha, setSenha] = useState("");

  const mensagem =
    props.tipo === "convite"
      ? mensagemConvite({
          clienteNome: props.clienteNome,
          link: props.link,
          senha,
          prazo: props.prazo,
        })
      : mensagemEntrega({
          clienteNome: props.clienteNome,
          link: props.link,
          senha,
          ate: props.ate,
          quantidade: props.quantidade,
        });
  const assunto = props.tipo === "convite" ? assuntoConvite(props.titulo) : assuntoEntrega(props.titulo);

  const destinoWhatsApp = linkWhatsApp(props.whatsapp, mensagem);
  const email = props.clienteEmail?.trim() || null;
  const dadosEmail = email ? { para: email, assunto, corpo: mensagem } : null;

  return (
    <section>
      <h2 className="font-hud text-xs uppercase tracking-cine text-tinta-3">
        {props.tipo === "convite" ? "Mensagem pro cliente" : "Avisar o cliente da entrega"}
      </h2>

      <div className="mt-3 flex w-full max-w-xs flex-col gap-2">
        <Label htmlFor={`senha-msg-${props.tipo}`}>Senha da galeria</Label>
        <Input
          id={`senha-msg-${props.tipo}`}
          value={senha}
          onChange={(evento) => setSenha(evento.target.value)}
          placeholder="a que você definiu"
          autoComplete="off"
        />
        <p className="font-hud text-xs text-tinta-3">
          Não fica salva. Serve só pra montar o texto abaixo.
        </p>
      </div>

      <pre className="mt-4 whitespace-pre-wrap border border-linha bg-superficie p-4 font-body text-sm leading-relaxed text-tinta-2">
        {mensagem}
      </pre>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <BotaoCopiar texto={mensagem} rotulo="Copiar mensagem" />

        {destinoWhatsApp ? (
          <Button asChild variant="outline" size="sm">
            <a href={destinoWhatsApp} target="_blank" rel="noopener noreferrer">
              <MessageCircle />
              Abrir no WhatsApp
            </a>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled title="Cadastre o WhatsApp do cliente">
            <MessageCircle />
            Abrir no WhatsApp
          </Button>
        )}

        {dadosEmail ? (
          <>
            <Button asChild variant="outline" size="sm">
              <a href={linkGmail(dadosEmail)} target="_blank" rel="noopener noreferrer">
                <Mail />
                Abrir no Gmail
              </a>
            </Button>
            {/* Para quem não usa o Gmail na web: abre o app de e-mail do aparelho. */}
            <a
              href={linkMailto(dadosEmail)}
              className="font-hud text-xs text-tinta-3 underline underline-offset-4 transition-colors hover:text-tinta"
            >
              ou no app de e-mail
            </a>
          </>
        ) : (
          <Button variant="outline" size="sm" disabled title="Cadastre o e-mail do cliente">
            <Mail />
            Abrir no Gmail
          </Button>
        )}
      </div>

      {(!destinoWhatsApp || !dadosEmail) && (
        <p className="mt-2 font-hud text-xs text-tinta-3">
          {!destinoWhatsApp && !dadosEmail
            ? "Sem WhatsApp nem e-mail cadastrados — corrija em Contato do cliente, ao lado."
            : !destinoWhatsApp
              ? "Sem WhatsApp cadastrado — corrija em Contato do cliente, ao lado."
              : "Sem e-mail cadastrado — corrija em Contato do cliente, ao lado."}
        </p>
      )}
    </section>
  );
}
