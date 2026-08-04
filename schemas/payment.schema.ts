import { z } from "zod";

import { PaymentMethod } from "@/lib/generated/prisma/enums";

// Valor sempre positivo, nas duas direções: o sinal vem do tipo do lançamento,
// nunca do número. Guardar negativo permitiria um REFUND de -50 que SOMA ao
// recebido — a combinação que o CHECK do banco e este schema existem para
// tornar impossível. Duas casas decimais porque a coluna é DECIMAL(10,2);
// aceitar mais faria o banco arredondar por baixo dos panos.
const amountSchema = z
  .number()
  .positive("Valor deve ser maior que zero")
  .max(99_999_999.99, "Valor acima do limite")
  .refine(
    (v) => Number.isFinite(v) && Math.round(v * 100) === Number((v * 100).toFixed(0)),
    {
      message: "Valor deve ter no máximo duas casas decimais",
    },
  );

// Gerada pelo cliente ao abrir o formulário (crypto.randomUUID()), não
// derivada dos dados — dois recebimentos legítimos de R$ 50 no PIX no mesmo
// minuto são normais e não podem colidir.
const idempotencyKeySchema = z
  .string()
  .min(8, "Chave de idempotência inválida")
  .max(100, "Chave de idempotência inválida");

export const registerPaymentSchema = z.object({
  orderId: z.string().min(1),
  amount: amountSchema,
  method: z.enum(PaymentMethod),
  // Formato do <input type="date">. Sem horário: quem lança informa o dia em
  // que o dinheiro entrou, não o instante.
  paidAt: z.string().date(),
  note: z.string().max(500).optional().or(z.literal("")),
  idempotencyKey: idempotencyKeySchema,
});

export type RegisterPaymentInput = z.infer<typeof registerPaymentSchema>;

// Estorno exige justificativa: um lançamento negativo sem motivo escrito é
// rastro inútil na hora de auditar por que o dinheiro saiu.
export const refundPaymentSchema = z.object({
  orderId: z.string().min(1),
  amount: amountSchema,
  method: z.enum(PaymentMethod),
  paidAt: z.string().date(),
  note: z.string().trim().min(3, "Informe o motivo do estorno").max(500),
  idempotencyKey: idempotencyKeySchema,
});

export type RefundPaymentInput = z.infer<typeof refundPaymentSchema>;
