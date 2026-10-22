# ZP Pics

Plataforma de seleção e entrega de fotos para estúdio de fotografia.

## Funcionalidades

- **Seleção de fotos:** Galeria rápida e responsiva para clientes visualizarem prévias com marca d'água e realizarem a seleção de fotos do ensaio.
- **Painel administrativo:** Gestão de sessões, upload em lote de derivados, acompanhamento de escolhas e entrega de arquivos finais em alta resolução.
- **Armazenamento em nuvem:** Derivados e fotos finais integrados com Cloudflare R2 com links assinados e URLs temporárias seguras.
- **Autenticação:** Acesso por slug e senha única por sessão para clientes, com autenticação administrativa via Supabase.

## Stack

- **Framework:** Next.js (App Router)
- **Linguagem:** TypeScript
- **Estilização:** Tailwind CSS
- **Banco de dados & Auth:** Supabase
- **Armazenamento:** Cloudflare R2
- **Hospedagem:** Vercel

## Configuração local

1. Clone o repositório:
```bash
git clone https://github.com/monthaydev/zp-pics.git
cd zp-pics
```

2. Instale as dependências:
```bash
npm install
```

3. Configure as variáveis de ambiente:
Copie o arquivo `.env.example` para `.env.local` e preencha as credenciais:
```bash
cp .env.example .env.local
```

4. Execute o servidor de desenvolvimento:
```bash
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000) no seu navegador.
