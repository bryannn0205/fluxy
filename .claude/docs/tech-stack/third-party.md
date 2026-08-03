# 🔌 Third-party Services

## Authentication

### Auth.js (NextAuth)

```bash
npm install next-auth
```

### Setup

```typescript
// lib/auth.ts
import { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Email from "next-auth/providers/email";

export const authConfig: NextAuthConfig = {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    Credentials({
      credentials: {
        email: { label: "Email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const user = await findUserByEmail(credentials.email as string);
        if (
          user &&
          (await verifyPassword(credentials.password as string, user.password))
        ) {
          return {
            id: user.id,
            email: user.email,
            companyId: user.companyId,
          };
        }
        return null;
      },
    }),
    Email({
      server: process.env.EMAIL_SERVER_URL,
      from: process.env.EMAIL_FROM,
    }),
  ],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.companyId = user.companyId;
      }
      return token;
    },
    session: async ({ session, token }) => {
      session.user.companyId = token.companyId as string;
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
```

### Recursos Suportados

- ✅ Google Login
- ✅ Email/Senha
- ✅ Magic Link (preparado)
- ✅ Recuperação de Senha
- ✅ Verificação de Email
- ✅ JWT seguro
- ✅ Session handling

## File Storage

### Cloudflare R2

```bash
npm install @aws-sdk/client-s3
```

```typescript
// lib/r2.ts
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_SECRET_ACCESS_KEY!,
  },
});

export async function uploadFile(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  await r2Client.send(
    new PutObjectCommand({
      Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );

  // Retornar URL pública
  return `https://${process.env.CLOUDFLARE_R2_PUBLIC_URL}/${key}`;
}

export async function deleteFile(key: string): Promise<void> {
  await r2Client.send(
    new DeleteObjectCommand({
      Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME,
      Key: key,
    }),
  );
}
```

### Upload API

```typescript
// app/api/upload/route.ts
export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file") as File;
  const companyId = formData.get("companyId") as string;

  // Validar
  if (!file) {
    return Response.json({ error: "Arquivo obrigatório" }, { status: 400 });
  }

  // Verificar tipo
  const allowedTypes = ["image/jpeg", "image/png", "application/pdf"];
  if (!allowedTypes.includes(file.type)) {
    return Response.json({ error: "Tipo de arquivo inválido" }, { status: 400 });
  }

  // Upload
  const buffer = await file.arrayBuffer();
  const key = `${companyId}/${Date.now()}-${file.name}`;
  const url = await uploadFile(key, Buffer.from(buffer), file.type);

  return Response.json({ url, key });
}
```

## Payments

### Asaas

```bash
npm install axios
```

```typescript
// lib/asaas.ts
import axios from "axios";

const asaasClient = axios.create({
  baseURL:
    process.env.ASAAS_ENV === "sandbox"
      ? "https://sandbox.asaas.com/api/v3"
      : "https://api.asaas.com/api/v3",
  headers: {
    access_token: process.env.ASAAS_API_KEY,
  },
});

export interface CreateSubscriptionInput {
  customerId: string;
  billingType: "CREDIT_CARD" | "PIX" | "BOLETO";
  value: number;
  nextDueDate: string;
  description: string;
}

export async function createSubscription(input: CreateSubscriptionInput) {
  const response = await asaasClient.post("/subscriptions", {
    ...input,
    cycle: "MONTHLY",
  });

  return response.data;
}

export async function getSubscription(subscriptionId: string) {
  const response = await asaasClient.get(`/subscriptions/${subscriptionId}`);
  return response.data;
}

export async function cancelSubscription(subscriptionId: string) {
  const response = await asaasClient.delete(`/subscriptions/${subscriptionId}`);
  return response.data;
}
```

### Webhook Handler

```typescript
// app/api/webhooks/asaas/route.ts
export async function POST(request: Request) {
  const data = await request.json();

  switch (data.event) {
    case "payment_confirmed":
      await handlePaymentConfirmed(data);
      break;
    case "payment_failed":
      await handlePaymentFailed(data);
      break;
    case "subscription_created":
      await handleSubscriptionCreated(data);
      break;
    case "subscription_cancelled":
      await handleSubscriptionCancelled(data);
      break;
  }

  return Response.json({ success: true });
}
```

### PIX, Cartão, Boleto

- ✅ Suportados via Asaas
- ✅ Webhook para confirmação
- ✅ Gestão de assinaturas
- ✅ Relatórios

## Email

### Resend (Recomendado)

```bash
npm install resend
```

```typescript
// lib/email.ts
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail(to: string, subject: string, html: string) {
  const { data, error } = await resend.emails.send({
    from: "noreply@fluxy.com",
    to,
    subject,
    html,
  });

  if (error) {
    throw new Error(`Email send failed: ${error.message}`);
  }

  return data;
}

// Uso
await sendEmail(user.email, "Bem-vindo ao Fluxy", "<h1>Bem-vindo!</h1>");
```

## Observability & Analytics

### Vercel Analytics

- ✅ Web Vitals automáticos
- ✅ Real User Monitoring
- ✅ Performance insights

### Sentry (Error Tracking)

```bash
npm install @sentry/nextjs
```

```typescript
// app/layout.tsx
import { init } from "@sentry/nextjs";

init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
});
```

### Logging Estruturado

```typescript
// lib/logger.ts
const logger = {
  info: (msg: string, meta?: any) => {
    console.log(JSON.stringify({ level: "INFO", msg, ...meta }));
  },
  error: (msg: string, meta?: any) => {
    console.error(JSON.stringify({ level: "ERROR", msg, ...meta }));
  },
  warn: (msg: string, meta?: any) => {
    console.warn(JSON.stringify({ level: "WARN", msg, ...meta }));
  },
};

export default logger;
```

## Environmental Variables

### Desenvolvimento

```
AUTH_SECRET=dev-secret-key
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
RESEND_API_KEY=
ASAAS_API_KEY=
ASAAS_ENV=sandbox
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_ACCESS_KEY_ID=
CLOUDFLARE_SECRET_ACCESS_KEY=
CLOUDFLARE_R2_BUCKET_NAME=
CLOUDFLARE_R2_PUBLIC_URL=
```

### Produção

- Usar Vercel Secrets
- Nunca committar em `.env`
- Rotação de secrets regularmente

## Checklist de Integração

- [ ] Auth.js configurado com Google + Email
- [ ] Recuperação de senha implementada
- [ ] Verificação de email implementada
- [ ] R2 upload funcionando
- [ ] Asaas webhook configurado
- [ ] Emails transacionais funcionando
- [ ] Sentry capturando errors
- [ ] Analytics funcionando
- [ ] Rate limiting implementado

---

**Ver também:**

- [Security](../features/security.md)
- [Backend Stack](./backend.md)
