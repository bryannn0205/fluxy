"use client";

import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ORDER_PRIORITY_LABELS } from "@/lib/constants";
import type { OrderPriority } from "@/lib/generated/prisma/client";
import {
  PERIODOS_DE_FILTRO,
  PRIORIDADE_TODAS,
  ROTULO_DE_PERIODO,
  haFiltroAtivo,
  type FiltrosDeProducao,
  type PeriodoDeFiltro,
} from "@/app/dashboard/production/_components/filtros";

// Da mais urgente para a menos: numa fila de produção, quem procura por
// prioridade quase sempre procura pelo topo dela.
const PRIORIDADES: OrderPriority[] = ["URGENT", "HIGH", "NORMAL", "LOW"];

interface ProductionFiltersProps {
  filtros: FiltrosDeProducao;
  onChange: (filtros: FiltrosDeProducao) => void;
  onLimpar: () => void;
  /** Pedidos visíveis depois do filtro, e o total do board. */
  visiveis: number;
  total: number;
}

export function ProductionFilters({
  filtros,
  onChange,
  onLimpar,
  visiveis,
  total,
}: ProductionFiltersProps) {
  const ativo = haFiltroAtivo(filtros);

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search
            className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={filtros.busca}
            onChange={(event) => onChange({ ...filtros, busca: event.target.value })}
            placeholder="Buscar por número ou cliente..."
            className="pl-8"
            // Sem <label> visível porque o ícone e o placeholder já dizem o que
            // o campo faz; o nome acessível vem daqui para quem não os vê.
            aria-label="Buscar pedidos na produção"
          />
        </div>

        {/* Dois por linha no celular em vez de empilhados: o par cabe na
            largura de 320px e poupa uma altura que o board precisa. */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <Select
            value={filtros.prioridade}
            onValueChange={(value) =>
              onChange({
                ...filtros,
                prioridade: (value ||
                  PRIORIDADE_TODAS) as FiltrosDeProducao["prioridade"],
              })
            }
          >
            <SelectTrigger className="w-full sm:w-40" aria-label="Filtrar por prioridade">
              <SelectValue placeholder="Prioridade">
                {(value: string | null) =>
                  !value || value === PRIORIDADE_TODAS
                    ? "Toda prioridade"
                    : ORDER_PRIORITY_LABELS[value as OrderPriority]
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={PRIORIDADE_TODAS}>Toda prioridade</SelectItem>
              {PRIORIDADES.map((prioridade) => (
                <SelectItem key={prioridade} value={prioridade}>
                  {ORDER_PRIORITY_LABELS[prioridade]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filtros.periodo}
            onValueChange={(value) =>
              onChange({ ...filtros, periodo: (value || "TODOS") as PeriodoDeFiltro })
            }
          >
            <SelectTrigger className="w-full sm:w-44" aria-label="Filtrar por período">
              <SelectValue placeholder="Período">
                {(value: string | null) =>
                  ROTULO_DE_PERIODO[(value as PeriodoDeFiltro) || "TODOS"]
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {PERIODOS_DE_FILTRO.map((periodo) => (
                <SelectItem key={periodo} value={periodo}>
                  {ROTULO_DE_PERIODO[periodo]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Só existe quando há o que limpar: um botão permanentemente inerte
            ensina o usuário a ignorá-lo. */}
        {ativo && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onLimpar}
            className="self-start sm:self-auto"
          >
            <X className="size-4" aria-hidden="true" />
            Limpar filtros
          </Button>
        )}
      </div>

      {/* O resultado do filtro dito em texto, não só pelo board esvaziando:
          quem usa leitor de tela não vê os cartões sumirem. */}
      {ativo && (
        <p role="status" className="text-xs text-muted-foreground">
          {visiveis === 0
            ? `Nenhum dos ${total} pedidos corresponde aos filtros.`
            : `${visiveis} de ${total} pedidos correspondem aos filtros.`}
        </p>
      )}
    </div>
  );
}
