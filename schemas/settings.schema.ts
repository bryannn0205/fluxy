import { z } from "zod";

export const updateProfileSchema = z.object({
  name: z.string().min(2, "Nome é obrigatório").max(200),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const updateCompanySchema = z.object({
  name: z.string().min(2, "Nome é obrigatório").max(200),
  phone: z.string().max(20).optional().or(z.literal("")),
});

export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
