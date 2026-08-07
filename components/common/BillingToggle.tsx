"use client";

import { useId } from "react";

import { BILLING_INTERVALS, type BillingInterval } from "@/lib/constants";
import { cn } from "@/lib/utils";

const ROTULOS: Record<BillingInterval, string> = {
  monthly: "Mensal",
  yearly: "Anual",
};

interface BillingToggleProps {
  value: BillingInterval;
  onChange: (intervalo: BillingInterval) => void;
  className?: string;
}

/**
 * Alternador Mensal/Anual, controlado.
 *
 * Rádios nativos: as setas do teclado já navegam entre as opções e o leitor
 * de tela anuncia "Mensal, 1 de 2, selecionado" sem uma linha de ARIA. Um par
 * de `<button>` exigiria reimplementar tudo isso.
 *
 * Componente controlado, sem estado próprio — quem usa é dono da escolha, e é
 * lá que se decide o que ela significa. Aqui não há efeito colateral algum: a
 * periodicidade não altera plano, assinatura nem cobrança, só qual preço a
 * tela imprime.
 */
export function BillingToggle({ value, onChange, className }: BillingToggleProps) {
  const idDoGrupo = useId();

  return (
    <fieldset className={cn("flex justify-center", className)}>
      <legend className="sr-only">Periodicidade da cobrança</legend>
      <div className="inline-flex rounded-lg border border-border bg-card p-1">
        {BILLING_INTERVALS.map((intervalo) => {
          const id = `${idDoGrupo}-${intervalo}`;
          const selecionado = value === intervalo;

          return (
            <div key={intervalo}>
              <input
                type="radio"
                id={id}
                name={`${idDoGrupo}-cobranca`}
                value={intervalo}
                checked={selecionado}
                onChange={() => onChange(intervalo)}
                className="peer sr-only"
              />
              <label
                htmlFor={id}
                className={cn(
                  "block cursor-pointer rounded-md px-5 py-2 text-sm font-medium transition-colors duration-150",
                  "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2",
                  selecionado
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {ROTULOS[intervalo]}
              </label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
