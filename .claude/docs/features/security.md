# 🔐 Segurança

## Ameaças a Mitigar

| Ameaça                  | Mitigação                            |
| ----------------------- | ------------------------------------ |
| SQL Injection           | Prisma (queries parametrizadas)      |
| XSS                     | React escaping + CSP + sanitização   |
| CSRF                    | SameSite cookies + Server Actions    |
| Brute Force             | Rate limiting + lockout progressivo  |
| Session Hijacking       | HttpOnly + Secure + rotação de token |
| Mass Assignment         | Zod schemas com campos explícitos    |
| IDOR                    | Filtro `companyId` em toda query     |
| Vazamento entre tenants | Autorização no backend, sempre       |

## SQL Injection

```typescript
// ✅ Prisma sempre parametriza
await prisma.order.findMany({
  where: { orderNumber: userInput }, // Seguro
});

// ⚠️ Raw query — só se inevitável, sempre com template tag
await prisma.$queryRaw`
  SELECT * FROM orders WHERE company_id = ${companyId}
`; // Seguro: $queryRaw parametriza

// ❌ NUNCA concatenar
await prisma.$queryRawUnsafe(`SELECT * FROM orders WHERE id = '${userInput}'`); // Vulnerável
```

## XSS (Cross-Site Scripting)

```typescript
// ✅ React escapa por padrão
<div>{userContent}</div>

// ❌ Perigoso
<div dangerouslySetInnerHTML={{ __html: userContent }} />

// ✅ Se precisar de HTML, sanitize
import DOMPurify from 'isomorphic-dompurify'

<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userContent) }} />
```

### Content Security Policy

```typescript
// next.config.js
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

module.exports = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
```

## Hash de Senha — Argon2

```typescript
// lib/password.ts
import argon2 from "argon2";

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
```

⚠️ **Nunca** use MD5, SHA1, SHA256 puro ou bcrypt com custo baixo para senhas.

## Rate Limiting

```typescript
// lib/rate-limit.ts
import { redis } from "./redis";

interface RateLimitOptions {
  identifier: string;
  limit: number;
  windowSeconds: number;
}

export async function checkRateLimit({
  identifier,
  limit,
  windowSeconds,
}: RateLimitOptions): Promise<{ allowed: boolean; remaining: number }> {
  const key = `ratelimit:${identifier}`;
  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, windowSeconds);
  }

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
  };
}
```

```typescript
// Uso no login
export async function loginAction(input: unknown) {
  const ip = headers().get("x-forwarded-for") ?? "unknown";

  const { allowed } = await checkRateLimit({
    identifier: `login:${ip}`,
    limit: 5,
    windowSeconds: 900, // 5 tentativas por 15 min
  });

  if (!allowed) {
    return { error: "Muitas tentativas. Tente novamente em 15 minutos." };
  }
  // ...
}
```

### Limites Recomendados

| Endpoint                | Limite | Janela |
| ----------------------- | ------ | ------ |
| Login                   | 5      | 15 min |
| Recuperação de senha    | 3      | 1 hora |
| Registro                | 3      | 1 hora |
| API geral (autenticado) | 100    | 1 min  |
| Upload                  | 20     | 1 hora |
| Webhook externo         | 1000   | 1 min  |

## Proteção Contra Brute Force

```typescript
// Além de rate limit por IP, lockout por conta
export async function recordFailedLogin(email: string): Promise<void> {
  const key = `failed_login:${email}`;
  const attempts = await redis.incr(key);
  await redis.expire(key, 3600);

  if (attempts >= 10) {
    await lockAccount(email);
    await notifyUserOfSuspiciousActivity(email);
  }
}
```

## Sessões Seguras

```typescript
// lib/auth.ts
export const authConfig: NextAuthConfig = {
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 dias
    updateAge: 24 * 60 * 60, // renova a cada 24h
  },
  cookies: {
    sessionToken: {
      name: "__Secure-fluxy.session",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  jwt: {
    maxAge: 7 * 24 * 60 * 60,
  },
};
```

## Mass Assignment

```typescript
// ❌ Vulnerável — usuário pode injetar campos
await prisma.user.update({
  where: { id },
  data: requestBody, // pode conter { role: 'ADMIN' }
});

// ✅ Schema explícito, apenas campos permitidos
const updateProfileSchema = z.object({
  name: z.string().min(1).max(100),
  phone: phoneSchema.optional(),
});

const validation = updateProfileSchema.safeParse(requestBody);
await prisma.user.update({
  where: { id, companyId },
  data: validation.data, // Só name e phone
});
```

## IDOR (Insecure Direct Object Reference)

```typescript
// ❌ Vulnerável — qualquer usuário acessa qualquer pedido
export async function GET(request: Request, { params }) {
  const order = await prisma.order.findUnique({ where: { id: params.id } });
  return Response.json(order);
}

// ✅ Seguro — filtra por companyId da sessão
export async function GET(request: Request, { params }) {
  const session = await requireAuth();

  const order = await prisma.order.findFirst({
    where: {
      id: params.id,
      companyId: session.user.companyId, // Isolamento garantido
    },
  });

  if (!order) {
    return Response.json({ error: "Não encontrado" }, { status: 404 });
  }

  return Response.json(order);
}
```

⚠️ Retorne **404**, não 403, para não revelar a existência do recurso.

## Criptografia de Dados Sensíveis

```typescript
// lib/crypto.ts
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const key = scryptSync(env.ENCRYPTION_KEY, "fluxy-salt", 32);

export function encrypt(text: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(payload: string): string {
  const [ivHex, authTagHex, dataHex] = payload.split(":");

  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));

  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}
```

Criptografe: chaves de API de clientes, tokens de integração, dados bancários.

## Logs de Auditoria

```typescript
// services/AuditService.ts
type AuditAction =
  "CREATE" | "UPDATE" | "DELETE" | "LOGIN" | "EXPORT" | "PERMISSION_CHANGE";

export class AuditService {
  async log(params: {
    companyId: string;
    userId: string;
    action: AuditAction;
    resource: string;
    resourceId: string;
    changes?: Record<string, { before: unknown; after: unknown }>;
    ip?: string;
  }): Promise<void> {
    await prisma.auditLog.create({ data: params });
  }
}
```

Sempre audite: login/logout, mudanças de permissão, exclusões, exports de dados, alterações de faturamento.

## Nunca Expor Informações Sensíveis

```typescript
// ❌ Vaza detalhes internos
catch (error) {
  return Response.json({ error: error.message, stack: error.stack })
}

// ✅ Mensagem genérica para o usuário, detalhes no log
catch (error) {
  logger.error('Order creation failed', { error, companyId, userId })
  return Response.json({ error: 'Não foi possível processar a solicitação' }, { status: 500 })
}
```

### Nunca retornar em respostas

- Hashes de senha
- Tokens de sessão
- Chaves de API
- Stack traces
- Queries SQL
- IDs internos de outros tenants

## Validação de Webhooks

```typescript
// app/api/webhooks/asaas/route.ts
export async function POST(request: Request) {
  const signature = request.headers.get("asaas-access-token");

  if (signature !== env.ASAAS_WEBHOOK_TOKEN) {
    logger.warn("Invalid webhook signature");
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Processar apenas após validar assinatura
}
```

## Checklist de Segurança

- [ ] Todas as queries filtram `companyId`
- [ ] `companyId` sempre vem da sessão, nunca do input
- [ ] Senhas com Argon2id
- [ ] Rate limiting em login, registro, recuperação de senha
- [ ] Security headers configurados (CSP, HSTS, X-Frame-Options)
- [ ] Cookies HttpOnly + Secure + SameSite
- [ ] Schemas Zod com campos explícitos (anti mass assignment)
- [ ] 404 em vez de 403 para recursos de outros tenants
- [ ] Dados sensíveis criptografados em repouso
- [ ] Audit log para ações críticas
- [ ] Webhooks com validação de assinatura
- [ ] Sem stack traces nas respostas
- [ ] Secrets fora do repositório
- [ ] Dependências auditadas (`npm audit`)

---

**Ver também:**

- [Multi-tenant](../architecture/multi-tenant.md)
- [Validation](../quality/validation.md)
- [Logging](../development/logging.md)
