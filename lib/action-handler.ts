import { AppError, ValidationError } from "@/lib/errors";
import { logger, type LogContext } from "@/lib/logger";
import type { ActionResult } from "@/types/common";

export async function handleAction<T>(
  fn: () => Promise<T>,
  context: LogContext = {},
): Promise<ActionResult<T>> {
  try {
    return { data: await fn() };
  } catch (error) {
    if (error instanceof ValidationError) {
      return { error: error.userMessage, fields: error.fieldErrors };
    }

    if (error instanceof AppError) {
      logger.warn(error.message, { code: error.code, ...context });
      return { error: error.userMessage };
    }

    logger.error("Unhandled action error", { error, ...context });
    return { error: "Ocorreu um erro inesperado. Tente novamente." };
  }
}
