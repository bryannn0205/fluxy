import { Ratelimit } from "@upstash/ratelimit";

import { redis } from "@/lib/redis";
import { logger } from "@/lib/logger";

interface RateLimitOptions {
  identifier: string;
  limit: number;
  windowSeconds: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

const limiters = new Map<string, Ratelimit>();

function getLimiter(limit: number, windowSeconds: number): Ratelimit | null {
  if (!redis) return null;

  const key = `${limit}:${windowSeconds}`;
  const existing = limiters.get(key);
  if (existing) return existing;

  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
    prefix: "fluxy:ratelimit",
  });

  limiters.set(key, limiter);
  return limiter;
}

// Sem Redis configurado (ex.: dev local), o rate limit fica inativo —
// falha aberto localmente, nunca em produção, onde o Redis é obrigatório.
export async function checkRateLimit({
  identifier,
  limit,
  windowSeconds,
}: RateLimitOptions): Promise<RateLimitResult> {
  const limiter = getLimiter(limit, windowSeconds);

  if (!limiter) {
    logger.warn("Rate limit ignorado: Redis não configurado", { identifier });
    return { allowed: true, remaining: limit };
  }

  const result = await limiter.limit(identifier);

  return { allowed: result.success, remaining: result.remaining };
}

// Limites recomendados — ver .claude/docs/features/security.md
export const RATE_LIMITS = {
  LOGIN: { limit: 5, windowSeconds: 900 },
  PASSWORD_RESET: { limit: 3, windowSeconds: 3600 },
  REGISTER: { limit: 3, windowSeconds: 3600 },
  API: { limit: 100, windowSeconds: 60 },
  UPLOAD: { limit: 20, windowSeconds: 3600 },
  WEBHOOK: { limit: 1000, windowSeconds: 60 },
  // Generoso o bastante para crescimento normal de equipe, restrito o
  // bastante para não virar um vetor de spam de e-mail.
  INVITE: { limit: 20, windowSeconds: 3600 },
} as const;
