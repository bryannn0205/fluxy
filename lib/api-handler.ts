import { AppError, ValidationError } from "@/lib/errors";
import { logger, type LogContext } from "@/lib/logger";

export function handleApiError(error: unknown, context: LogContext = {}): Response {
  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      logger.error(error.message, { error, ...context });
    } else {
      logger.warn(error.message, { code: error.code, ...context });
    }

    return Response.json(
      {
        code: error.code,
        message: error.userMessage,
        ...(error instanceof ValidationError && { fields: error.fieldErrors }),
      },
      { status: error.statusCode },
    );
  }

  logger.error("Unhandled error", { error, ...context });

  return Response.json(
    { code: "INTERNAL_ERROR", message: "Erro interno. Tente novamente." },
    { status: 500 },
  );
}
