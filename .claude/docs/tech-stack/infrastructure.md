# 🚀 Infrastructure & Deployment

> ⚠️ **Para deploy real, use [deploy-vercel.md](deploy-vercel.md).**
> Aquele documento foi conferido contra o código em 03/08/2026. Este aqui é
> anterior e descreve intenções que ainda não existem no repositório — o workflow
> do GitHub Actions (não há `.github/`), o arquivo `.env.local` (o projeto usa
> `.env`) e o Asaas como provedor de cobrança (a escolha é a ValidaPay, e não há
> código de cobrança). Trate o conteúdo abaixo como proposta, não como estado.

## Hosting

### Frontend

- **Vercel** — Deploy automático via Git
- ✅ Edge functions
- ✅ Image optimization
- ✅ Edge caching
- ✅ Analytics

### Database

- **Neon PostgreSQL** — Managed Postgres
- ✅ Auto-scaling
- ✅ Backups automáticos
- ✅ Replicação
- ✅ Point-in-time recovery

### Cache

- **Redis** — Cache distribuído
- ✅ Cloudflare Workers KV (alternativa)
- ✅ Sessões
- ✅ Rate limiting

### Storage

- **Cloudflare R2** — Object storage
- ✅ S3-compatible
- ✅ Egress grátis
- ✅ Replicação global

## Environment Variables

### `.env.local` (Desenvolvimento)

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/fluxy

# Redis
REDIS_URL=redis://localhost:6379

# Auth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key

# Google OAuth
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx

# Cloudflare
CLOUDFLARE_ACCOUNT_ID=xxx
CLOUDFLARE_API_TOKEN=xxx
CLOUDFLARE_R2_BUCKET_NAME=fluxy-dev

# Asaas
ASAAS_API_KEY=xxx
ASAAS_ENV=sandbox
```

### `.env.production` (Produção)

```bash
# Nunca committar secrets!
# Usar Vercel Secrets ou similar
```

### GitHub Secrets

```bash
# Configurar em Settings > Secrets > Actions
DATABASE_URL
REDIS_URL
NEXTAUTH_SECRET
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
CLOUDFLARE_R2_BUCKET_NAME
ASAAS_API_KEY
```

## Deployment Pipeline

### GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - run: npm ci
      - run: npm run lint
      - run: npm run type-check
      - run: npm run test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to Vercel
        uses: vercel/action@v4
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
```

## Database Migrations

### Local Development

```bash
# Criar migration
npx prisma migrate dev --name add_orders_table

# Ver status
npx prisma migrate status

# Reset (cuidado!)
npx prisma migrate reset
```

### Produção

```bash
# Deploy via Vercel preview
npx prisma migrate deploy

# Ou via CI/CD
npx prisma migrate deploy --skip-generate
```

## Scaling Strategy

### Horizontal Scaling

- ✅ Stateless Next.js instances
- ✅ Session store em Redis (não memory)
- ✅ Database connection pooling

### Vertical Scaling

- ✅ Neon auto-scaling
- ✅ Redis sharding se necessário
- ✅ R2 global distribution

### Caching Strategy

```
Request → Edge (Vercel) → Next.js → Redis → Postgres
          ↓
       Cache hit
```

## Monitoring & Logging

### Application Monitoring

- Vercel Analytics
- Sentry (error tracking)
- New Relic ou Datadog (opcional)

### Database Monitoring

- Neon console
- Prometheus queries
- Database logs

### Performance Monitoring

- Web Vitals via Vercel Analytics
- Custom metrics no frontend

### Error Tracking

```typescript
// lib/sentry.ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
});
```

## Security

### HTTPS/TLS

- ✅ Automático via Vercel
- ✅ Wildcard certificates
- ✅ Auto-renewal

### DDoS Protection

- ✅ Cloudflare DDoS Protection
- ✅ Rate limiting

### Secrets Management

- ✅ Vercel Secrets
- ✅ Nunca committar `.env.local`
- ✅ `.env.local` no `.gitignore`

### SSL/TLS

```
Production: A+ SSL via Vercel
Development: Self-signed ou ngrok
```

## Backup Strategy

### Database Backups

- ✅ Neon automated backups (daily)
- ✅ Manual backups (weekly)
- ✅ Point-in-time recovery (30 dias)

### File Backups

- ✅ R2 versioning
- ✅ Cloudflare R2 replication

## Disaster Recovery

### RTO (Recovery Time Objective): < 1 hora

### RPO (Recovery Point Objective): < 15 minutos

### Procedures

1. Database backup restoration
2. R2 file restoration
3. Secrets re-deployment
4. Full smoke tests

## Local Development Setup

```bash
# Install dependencies
npm install

# Setup database
npx prisma migrate dev

# Start Redis locally
docker run -d -p 6379:6379 redis:latest

# Start dev server
npm run dev

# Open http://localhost:3000
```

## Docker (Optional)

```dockerfile
# Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
RUN npx prisma generate

EXPOSE 3000

CMD ["npm", "run", "start"]
```

```yaml
# docker-compose.yml
version: "3.8"
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: fluxy
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"

  redis:
    image: redis:latest
    ports:
      - "6379:6379"

  app:
    build: .
    ports:
      - "3000:3000"
    depends_on:
      - postgres
      - redis
    environment:
      DATABASE_URL: postgresql://postgres:password@postgres:5432/fluxy
      REDIS_URL: redis://redis:6379
```

---

**Ver também:**

- [Third-party Services](./third-party.md)
- [Security](../features/security.md)
