import { hash, verify } from "@node-rs/argon2";

// @node-rs/argon2 exporta `Algorithm` como `const enum`, incompatível com
// isolatedModules (exigido pelo Next.js). 2 = Algorithm.Argon2id.
const ARGON2_OPTIONS = {
  algorithm: 2,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}
