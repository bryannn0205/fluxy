import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // Aplicação
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),

  // Banco de dados — obrigatório, a aplicação não sobe sem isso.
  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatório"),

  // Auth.js — obrigatório para assinar sessões JWT.
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET deve ter ao menos 32 caracteres"),
  AUTH_URL: z.url().optional(),
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),

  // Redis (Upstash) — opcional; sem ele, cache e rate limit ficam inativos.
  UPSTASH_REDIS_REST_URL: z.url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // Cloudflare R2 — opcional; sem ele, upload de arquivos fica indisponível.
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  CLOUDFLARE_ACCESS_KEY_ID: z.string().optional(),
  CLOUDFLARE_SECRET_ACCESS_KEY: z.string().optional(),
  CLOUDFLARE_R2_BUCKET_NAME: z.string().optional(),
  CLOUDFLARE_R2_PUBLIC_URL: z.string().optional(),

  // Asaas — opcional; sem ele, cobrança fica indisponível.
  ASAAS_API_KEY: z.string().optional(),
  ASAAS_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  ASAAS_WEBHOOK_TOKEN: z.string().optional(),

  // ValidaPay — opcional; sem as credenciais, o pagamento fica indisponível e
  // o resto do produto continua funcionando, como no R2 e no Asaas.
  //
  // `production` precisa ser escolhido explicitamente: o padrão sandbox faz o
  // esquecimento errar para o lado seguro. As URLs NÃO são configuráveis —
  // derivam desta chave em lib/validapay/config.ts.
  //
  // Nenhuma leva prefixo NEXT_PUBLIC_: são credenciais de servidor.
  VALIDAPAY_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  VALIDAPAY_CLIENT_ID: z.string().optional(),
  VALIDAPAY_CLIENT_SECRET: z.string().optional(),
  VALIDAPAY_SCOPE: z.string().optional(),

  // E-mail transacional — opcional; sem ele, e-mails são apenas logados.
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Fluxy <naoresponda@fluxy.com.br>"),

  // Criptografia de dados sensíveis em repouso — opcional até o primeiro uso.
  ENCRYPTION_KEY: z.string().min(32).optional(),

  // Observabilidade — opcional.
  SENTRY_DSN: z.url().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(`Variáveis de ambiente inválidas:\n${issues}`);
  }

  return result.data;
}

export const env = loadEnv();
