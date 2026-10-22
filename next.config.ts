import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Existe um package-lock.json solto em C:\Users\João\ que faz o Next inferir
  // a raiz errada do projeto. Fixar aqui evita o aviso e o comportamento
  // imprevisível — mesmo remendo dos outros projetos da casa.
  turbopack: { root: __dirname },
};

export default nextConfig;
