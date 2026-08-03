import { z } from "zod";

// Números e booleanos usam tipos simples (não z.coerce nem .default()): o
// formulário sempre envia o objeto completo via chamada direta à Server
// Action (RSC), não FormData — coerção/default quebrariam a inferência de
// tipos do react-hook-form (input ≠ output). Os valores padrão vêm do
// `defaultValues` do useForm.
//
// stockQuantity não aparece aqui em nenhuma forma, nem na criação: todo
// produto nasce com estoque zero e ganha saldo exclusivamente através de
// StockService.adjust (ver stock.schema.ts) — um único caminho para toda
// variação de estoque, para que Product.stockQuantity permaneça sempre
// reconstruível a partir do histórico de StockMovement.
export const createProductSchema = z.object({
  sku: z
    .string()
    .min(1, "SKU é obrigatório")
    .max(50)
    .regex(/^[A-Za-z0-9-]+$/, "Use apenas letras, números e hífen"),
  name: z.string().min(1, "Nome é obrigatório").max(200),
  description: z.string().max(1000).optional().or(z.literal("")),
  price: z.number().positive("Preço deve ser maior que zero"),
  costPrice: z
    .number()
    .nonnegative("Custo não pode ser negativo")
    .optional()
    .or(z.literal("")),
  unit: z.string().min(1).max(10),
  active: z.boolean(),
  lowStockThreshold: z
    .number()
    .int()
    .nonnegative("Limite não pode ser negativo")
    .optional()
    .or(z.literal("")),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema.partial();

export type UpdateProductInput = z.infer<typeof updateProductSchema>;
