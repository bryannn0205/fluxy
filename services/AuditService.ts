import type { PrismaClient, AuditAction, Prisma } from "@/lib/generated/prisma/client";

interface LogParams {
  companyId: string;
  userId?: string;
  action: AuditAction;
  resource: string;
  resourceId: string;
  changes?: Record<string, unknown>;
  orderId?: string;
}

export class AuditService {
  constructor(private readonly prisma: PrismaClient) {}

  async log({
    companyId,
    userId,
    action,
    resource,
    resourceId,
    changes,
    orderId,
  }: LogParams): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        companyId,
        userId: userId ?? null,
        action,
        resource,
        resourceId,
        orderId: orderId ?? null,
        ...(changes !== undefined && {
          changes: changes as Prisma.InputJsonValue,
        }),
      },
    });
  }
}
