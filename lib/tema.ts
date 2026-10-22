export const CHAVE_TEMA = "zp-tema";

/**
 * O script que decide o tema antes do primeiro pixel.
 *
 * Precisa rodar síncrono no `<head>`, antes de qualquer pintura: sem isto o app
 * aparece no tema errado por um frame, e piscar papel branco antes de uma
 * galeria escura é pior do que não ter tema nenhum.
 *
 * Por ser injetado como string, não passa pelo TypeScript nem pelo bundler —
 * escreva ES5 defensivo aqui, e `try/catch` porque `localStorage` estoura em
 * navegação privada de alguns navegadores.
 *
 * A regra do padrão mora aqui e em nenhum outro lugar: **sem escolha salva, a
 * galeria do cliente nasce escura e o resto segue o sistema.** Fundo escuro é o
 * que faz a foto ser julgada com honestidade; já a home e o painel não têm foto
 * nenhuma na tela e não têm por que contrariar o sistema de quem abriu.
 */
export const SCRIPT_TEMA = `(function(){try{
var t=localStorage.getItem(${JSON.stringify(CHAVE_TEMA)});
if(t!=="claro"&&t!=="escuro"){t=location.pathname.indexOf("/s/")===0?"escuro":"";}
if(t){document.documentElement.setAttribute("data-tema",t);}
}catch(e){}})();`;
