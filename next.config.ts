import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Existe um package-lock.json solto em C:\Users\João\ que faz o Next inferir
  // a raiz errada do projeto. Fixar aqui evita o aviso e o comportamento
  // imprevisível — mesmo remendo dos outros projetos da casa.
  turbopack: { root: __dirname },

  // O app não mandava nenhum cabeçalho de segurança: o painel podia ser embutido
  // num <iframe> de outro site (clickjacking) e o navegador adivinhava o tipo
  // de qualquer arquivo. Valem para todas as rotas.
  //
  // CSP só com as diretivas que não dependem de nonce: o Next injeta scripts
  // inline, e uma `script-src` restrita sem nonce quebraria o app inteiro.
  // `frame-ancestors` é o que de fato impede o <iframe>.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
