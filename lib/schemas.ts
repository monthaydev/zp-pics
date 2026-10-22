import { z } from "zod";

/**
 * Validação de todo payload que cruza a fronteira do servidor.
 * Server Action sem zod aqui é bug esperando pra acontecer.
 */

export const STATUS_SESSAO = [
  "rascunho",
  "aberta",
  "finalizada",
  "expirada",
  "entregue",
  "arquivada",
] as const;
export type StatusSessao = (typeof STATUS_SESSAO)[number];

/** Login do painel. Não existe cadastro: o usuário é criado à mão no Supabase. */
export const esquemaLogin = z.object({
  email: z.email("E-mail inválido."),
  senha: z.string().min(1, "Digite a senha."),
});

export const esquemaSessao = z.object({
  titulo: z.string().trim().min(3, "Dê um nome ao ensaio.").max(120),
  cliente_nome: z.string().trim().min(2, "Nome do cliente é obrigatório.").max(120),
  cliente_email: z.email("E-mail inválido.").or(z.literal("")).optional(),
  cliente_whatsapp: z.string().trim().max(30).optional(),
  fotos_incluidas: z.coerce
    .number()
    .int()
    .min(1, "O pacote precisa ter pelo menos 1 foto.")
    .max(10_000),
  prazo_dias: z.coerce.number().int().min(1).max(365),
  // Curta e ditável no WhatsApp — não é segredo de estado, é a segunda metade
  // da credencial. O que protege de verdade é o slug aleatório + rate limit.
  senha: z.string().min(4, "A senha precisa de pelo menos 4 caracteres.").max(64),
  observacoes: z.string().trim().max(2000).optional(),
});

export type EntradaSessao = z.infer<typeof esquemaSessao>;

export const esquemaSenha = z.object({
  slug: z.string().trim().min(8).max(40),
  senha: z.string().min(1, "Digite a senha.").max(64),
});

/**
 * Uma foto registrada após o upload dos derivativos.
 *
 * `nome_original` é a única ligação entre a prévia que o cliente viu e o RAW no
 * HD da ZP — a entrega final é a lista desses nomes, colada no filtro do
 * Lightroom. Por isso ele não é trimado, normalizado nem tem caixa alterada.
 */
export const esquemaFoto = z.object({
  nome_original: z.string().min(1).max(255),
  ordem: z.number().int().min(0),
  largura: z.number().int().positive(),
  altura: z.number().int().positive(),
});

export const esquemaRegistrarFotos = z.object({
  sessao_id: z.uuid(),
  fotos: z.array(esquemaFoto.extend({ foto_id: z.uuid() })).min(1).max(2000),
});

/**
 * Pedido de URLs de upload.
 *
 * O teto de 60 não é decoração: cada item vira duas URLs assinadas, e assinar
 * é trabalho de CPU no servidor. O cliente manda o ensaio em lotes.
 */
export const esquemaPedidoUpload = z.object({
  sessao_id: z.uuid(),
  ids: z.array(z.uuid()).min(1).max(60),
});

/**
 * Um clique no coração — ou um Shift+clique numa faixa inteira.
 *
 * O `slug` vem junto porque é ele que aponta qual crachá conferir — a action é
 * um POST que qualquer um pode disparar, então ela nunca deduz a sessão do que
 * o cliente mandou: ela confere o cookie daquele slug e usa o id de lá.
 *
 * Lista, e não uma foto: o Next 16 despacha Server Actions uma de cada vez por
 * aba, e a faixa de 100 fotos virava 100 chamadas em fila (~30 s até a última
 * salvar). O teto acompanha o maior ensaio que o upload aceita.
 */
export const esquemaAlternarSelecao = z.object({
  slug: z.string().trim().min(8).max(40),
  foto_ids: z.array(z.uuid()).min(1).max(2000),
  escolhida: z.boolean(),
});

/** Abrir a galeria pro cliente. Só o admin chama, mas é Server Action: zod igual. */
export const esquemaAbrirSessao = z.object({
  sessao_id: z.uuid(),
});

/**
 * `escolhidas_esperadas` é quantas a TELA mostra no momento da confirmação. O
 * servidor recusa se o banco discordar — ver `finalizarSelecao`.
 */
export const esquemaFinalizar = z.object({
  slug: z.string().trim().min(8).max(40),
  escolhidas_esperadas: z.number().int().min(1),
});

/** Reabertura pelo admin. Exige prazo novo — reabrir com prazo vencido não abre nada. */
export const esquemaReabrir = z.object({
  sessao_id: z.uuid(),
  prazo_dias: z.coerce.number().int().min(1).max(365),
});

/**
 * Corrigir o contato do cliente depois de criada a sessão (o convite por Gmail
 * e por WhatsApp sai desses dois campos). Vazio apaga.
 */
export const esquemaContato = z.object({
  sessao_id: z.uuid(),
  cliente_email: z.email("E-mail inválido.").or(z.literal("")),
  cliente_whatsapp: z.string().trim().max(30),
});

/** Formatos aceitos na entrega das tratadas. RAW nunca: não é entrega, é original. */
export const TIPOS_ENTREGA = ["image/jpeg", "image/tiff"] as const;

/** 500 MB por arquivo: cobre um TIFF de 16 bits de câmera de 60 MP com folga. */
export const TAMANHO_MAXIMO_ENTREGA = 500 * 1024 * 1024;

/** A miniatura da grade é pequena por construção (480 px, WebP): 2 MB é folga de sobra. */
export const TAMANHO_MAXIMO_MINIATURA = 2 * 1024 * 1024;

const arquivoDeEntrega = z.object({
  // Intocado, pela mesma razão do `nome_original`: é o que o cliente baixa.
  nome: z.string().min(1).max(255),
  tamanho: z.number().int().positive().max(TAMANHO_MAXIMO_ENTREGA),
  tipo: z.enum(TIPOS_ENTREGA),
});

/**
 * A extensão tem que bater com o formato declarado. A fronteira da exceção à
 * Regra Número Um ("RAW nunca") não pode morar só no navegador: um cliente que
 * declarasse `image/jpeg` para um `.CR2` passaria direto.
 */
const extensaoBate = (a: { nome: string; tipo: (typeof TIPOS_ENTREGA)[number] }) =>
  a.tipo === "image/jpeg" ? /\.jpe?g$/i.test(a.nome) : /\.tiff?$/i.test(a.nome);
const MSG_EXTENSAO = "A extensão do arquivo não bate com o formato (só JPEG e TIFF).";

/** Nomes (e ids) repetidos no mesmo pedido gravariam duas linhas no mesmo objeto. */
const unicos = (xs: string[]) => new Set(xs).size === xs.length;

/** Pedido de URLs para subir tratadas. Cada arquivo vira uma URL de PUT. */
export const esquemaPedidoEntrega = z.object({
  sessao_id: z.uuid(),
  arquivos: z
    .array(
      arquivoDeEntrega
        .extend({ tamanhoMiniatura: z.number().int().positive().max(TAMANHO_MAXIMO_MINIATURA).optional() })
        .refine(extensaoBate, MSG_EXTENSAO),
    )
    .min(1)
    .max(60)
    .refine((as) => unicos(as.map((a) => a.nome)), "Há dois arquivos com o mesmo nome no pedido."),
});

export const esquemaRegistrarEntrega = z.object({
  sessao_id: z.uuid(),
  itens: z
    .array(
      arquivoDeEntrega
        .extend({
          id: z.uuid(),
          temMiniatura: z.boolean(),
          largura: z.number().int().positive().nullable(),
          altura: z.number().int().positive().nullable(),
        })
        .refine(extensaoBate, MSG_EXTENSAO),
    )
    .min(1)
    .max(60)
    .refine(
      (is) => unicos(is.map((i) => i.nome)) && unicos(is.map((i) => i.id)),
      "Há nomes ou ids repetidos no pedido.",
    ),
});

/** Concluir a entrega, ou estender o prazo dela. */
export const esquemaPrazoEntrega = z.object({
  sessao_id: z.uuid(),
  dias: z.coerce.number().int().min(1).max(365),
});

export const esquemaRemoverEntrega = z.object({
  sessao_id: z.uuid(),
  entrega_id: z.uuid(),
});
