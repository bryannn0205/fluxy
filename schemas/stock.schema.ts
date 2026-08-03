import { z } from "zod";

// SALE e CANCELLATION nunca são escolhidos manualmente aqui — são gerados
// automaticamente pelo ciclo de vida do pedido (ver OrderService). Este
// schema só aceita as duas razões que fazem sentido como ação humana.
export const adjustStockSchema = z.object({
  productId: z.string().min(1),
  reason: z.enum(["RESTOCK", "ADJUSTMENT"]),
  // Sinal explícito na UI (entrada/saída) em vez de aceitar negativo direto
  // do formulário: menos propenso a erro de digitação que inverte o sentido
  // do ajuste sem o usuário perceber.
  direction: z.enum(["IN", "OUT"]),
  quantity: z.number().int().positive("Quantidade deve ser maior que zero"),
  note: z.string().max(500).optional().or(z.literal("")),
});

export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
