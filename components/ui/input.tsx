import type * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-10 w-full rounded-sm border border-input bg-card px-3 py-2 text-sm text-foreground transition-colors",
        "placeholder:text-muted-foreground",
        "disabled:cursor-not-allowed disabled:opacity-50",
        // aria-invalid vem do estado de erro do formulário — nunca só cor,
        // sempre acompanhado da mensagem de texto ao lado do campo
        "aria-invalid:border-rec",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
