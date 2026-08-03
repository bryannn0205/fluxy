import { z } from "zod";

import { PAGINATION } from "@/lib/constants";
import { isValidCnpj, isValidCpf, isValidDocument } from "@/lib/validators";

export const emailSchema = z.email("E-mail inválido").toLowerCase().trim();

export const passwordSchema = z
  .string()
  .min(8, "Mínimo de 8 caracteres")
  .regex(/[A-Z]/, "Precisa de ao menos uma letra maiúscula")
  .regex(/[a-z]/, "Precisa de ao menos uma letra minúscula")
  .regex(/[0-9]/, "Precisa de ao menos um número");

export const cpfSchema = z
  .string()
  .transform((value) => value.replace(/\D/g, ""))
  .refine((value) => value.length === 11, "CPF deve ter 11 dígitos")
  .refine(isValidCpf, "CPF inválido");

export const cnpjSchema = z
  .string()
  .transform((value) => value.replace(/\D/g, ""))
  .refine((value) => value.length === 14, "CNPJ deve ter 14 dígitos")
  .refine(isValidCnpj, "CNPJ inválido");

// Aceita CPF ou CNPJ — usado onde o cliente pode ser pessoa física ou jurídica.
export const documentSchema = z
  .string()
  .transform((value) => value.replace(/\D/g, ""))
  .refine((value) => value.length === 0 || isValidDocument(value), "CPF ou CNPJ inválido")
  .optional();

export const phoneSchema = z
  .string()
  .transform((value) => value.replace(/\D/g, ""))
  .refine((value) => value.length >= 10 && value.length <= 11, "Telefone inválido");

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(PAGINATION.MAX_PAGE_SIZE)
    .default(PAGINATION.DEFAULT_PAGE_SIZE),
  search: z.string().max(100).optional(),
});
