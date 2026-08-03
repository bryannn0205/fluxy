import { z } from "zod";

import { documentSchema } from "@/schemas/common.schema";

export const createCustomerSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(200),
  email: z.email("E-mail inválido").optional().or(z.literal("")),
  phone: z.string().max(20).optional().or(z.literal("")),
  document: documentSchema,
  address: z.string().max(300).optional().or(z.literal("")),
  notes: z.string().max(1000).optional().or(z.literal("")),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = createCustomerSchema.partial();

export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
