import { Redis } from "@upstash/redis";

import { env } from "@/lib/env";

const globalForRedis = globalThis as unknown as {
  redis: Redis | null | undefined;
};

function createRedisClient(): Redis | null {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }

  return new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
}

// Retorna null quando o Redis não está configurado (ex.: dev local sem
// Upstash) — chamadores devem tratar isso como "cache/rate limit inativos",
// nunca lançar erro por causa disso.
export const redis = globalForRedis.redis ?? createRedisClient();

if (env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}
