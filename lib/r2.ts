import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { ExternalServiceError } from "@/lib/errors";

function createR2Client(): S3Client | null {
  if (
    !env.CLOUDFLARE_ACCOUNT_ID ||
    !env.CLOUDFLARE_ACCESS_KEY_ID ||
    !env.CLOUDFLARE_SECRET_ACCESS_KEY
  ) {
    return null;
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.CLOUDFLARE_ACCESS_KEY_ID,
      secretAccessKey: env.CLOUDFLARE_SECRET_ACCESS_KEY,
    },
  });
}

const r2Client = createR2Client();

// Chamadores usam isso para decidir se oferecem upload na UI antes mesmo de
// tentar — evita mostrar um formulário que vai falhar em toda submissão.
export function isR2Configured(): boolean {
  return (
    r2Client !== null &&
    Boolean(env.CLOUDFLARE_R2_BUCKET_NAME) &&
    Boolean(env.CLOUDFLARE_R2_PUBLIC_URL)
  );
}

/** @throws {ExternalServiceError} R2 não configurado ou upload falhou */
export async function uploadFile(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  if (!r2Client || !env.CLOUDFLARE_R2_BUCKET_NAME) {
    throw new ExternalServiceError("cloudflare-r2", new Error("R2 não configurado"));
  }

  try {
    await r2Client.send(
      new PutObjectCommand({
        Bucket: env.CLOUDFLARE_R2_BUCKET_NAME,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  } catch (error) {
    throw new ExternalServiceError("cloudflare-r2", error);
  }
}

// Best-effort: falha ao apagar o objeto no R2 não deve impedir o soft-delete
// do registro OrderAttachment — só registra o problema para limpeza manual.
export async function deleteFile(key: string): Promise<void> {
  if (!r2Client || !env.CLOUDFLARE_R2_BUCKET_NAME) return;

  try {
    await r2Client.send(
      new DeleteObjectCommand({ Bucket: env.CLOUDFLARE_R2_BUCKET_NAME, Key: key }),
    );
  } catch (error) {
    logger.error("Falha ao apagar objeto no R2", { error, key });
  }
}

export function getPublicUrl(key: string): string | null {
  if (!env.CLOUDFLARE_R2_PUBLIC_URL) return null;
  return `${env.CLOUDFLARE_R2_PUBLIC_URL}/${key}`;
}
