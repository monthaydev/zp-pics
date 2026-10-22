"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { atualizarContato } from "./entrega-acoes";

/**
 * Corrigir e-mail e WhatsApp do cliente.
 *
 * Existe porque o convite por Gmail e por WhatsApp sai desses dois campos, e
 * um dígito errado na hora de criar a sessão antes só tinha conserto criando
 * outra sessão e subindo as fotos de novo.
 */
export default function EditarContato({
  sessaoId,
  email,
  whatsapp,
}: {
  sessaoId: string;
  email: string | null;
  whatsapp: string | null;
}) {
  const [emailAtual, setEmailAtual] = useState(email ?? "");
  const [whatsappAtual, setWhatsappAtual] = useState(whatsapp ?? "");
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendente, comecar] = useTransition();

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(evento) => {
        evento.preventDefault();
        setAviso(null);
        comecar(async () => {
          const r = await atualizarContato({
            sessao_id: sessaoId,
            cliente_email: emailAtual.trim(),
            cliente_whatsapp: whatsappAtual.trim(),
          });
          setAviso(r.ok ? { ok: true, texto: "Contato salvo." } : { ok: false, texto: r.erro ?? "Não deu pra salvar." });
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="contato-email">E-mail</Label>
        <Input
          id="contato-email"
          type="email"
          value={emailAtual}
          onChange={(e) => setEmailAtual(e.target.value)}
          placeholder="cliente@gmail.com"
          autoComplete="off"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="contato-whatsapp">WhatsApp</Label>
        <Input
          id="contato-whatsapp"
          value={whatsappAtual}
          onChange={(e) => setWhatsappAtual(e.target.value)}
          placeholder="(11) 91234-5678"
          autoComplete="off"
        />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" variant="outline" disabled={pendente}>
          {pendente ? "Salvando…" : "Salvar contato"}
        </Button>
        {aviso && (
          <p role="status" className={`font-hud text-xs ${aviso.ok ? "text-tinta-2" : "text-rec-papel"}`}>
            {aviso.texto}
          </p>
        )}
      </div>
    </form>
  );
}
