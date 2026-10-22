import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Botão do painel da ZP.
 *
 * Sem `rounded-full`, sem shimmer, sem gradiente — a lista de proibidos do
 * design system. O destaque vem do contraste off-white sobre preto, que é como o
 * resto da identidade funciona. O anel de foco é `rec` porque quem opera este
 * painel opera no teclado.
 */
const variantesBotao = cva(
  // `active:scale` é resposta tátil, não enfeite: no celular não existe hover,
  // e sem ele nada confirma que o toque pegou até a tela seguinte carregar.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm text-sm font-medium transition-[colors,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        outline:
          "border border-border bg-transparent text-foreground hover:bg-accent",
        ghost: "text-muted-foreground hover:bg-accent hover:text-foreground",
        link: "text-foreground underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-6",
        icon: "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof variantesBotao> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(variantesBotao({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, variantesBotao };
