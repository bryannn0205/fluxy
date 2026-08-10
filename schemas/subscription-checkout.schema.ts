import { z } from "zod";

import { BillingInterval } from "@/lib/generated/prisma/enums";

export const iniciarCheckoutSchema = z.object({
  planId: z.string().min(1, "Plano é obrigatório"),
  billingInterval: z.enum(BillingInterval),
});

export type IniciarCheckoutInput = z.infer<typeof iniciarCheckoutSchema>;
