import type { Company } from "@/lib/generated/prisma/client";
import { SubscriptionRequiredError } from "@/lib/errors";
import type { ModuleKey } from "@/lib/constants";

// Único ponto de decisão sobre "a empresa pode usar o produto agora?".
// V1 tem um único Plan com todos os módulos, então hasModuleAccess sempre
// retorna true quando a assinatura está ativa — mas a checagem por módulo
// já existe para quando planos com módulos diferentes forem introduzidos.
// Ver .claude/docs/project/product.md.
export class SubscriptionGateService {
  private isSubscriptionActive(
    company: Pick<Company, "subscriptionStatus" | "trialEndsAt">,
  ): boolean {
    if (company.subscriptionStatus === "ACTIVE") return true;

    if (company.subscriptionStatus === "TRIALING") {
      return company.trialEndsAt.getTime() > Date.now();
    }

    return false;
  }

  /** Lança SubscriptionRequiredError se a empresa não pode criar/editar registros. */
  assertCanWrite(company: Pick<Company, "subscriptionStatus" | "trialEndsAt">): void {
    if (!this.isSubscriptionActive(company)) {
      throw new SubscriptionRequiredError();
    }
  }

  hasModuleAccess(
    company: Pick<Company, "subscriptionStatus" | "trialEndsAt">,
    plan: { modules: string[] } | null,
    moduleKey: ModuleKey,
  ): boolean {
    if (!this.isSubscriptionActive(company)) return false;
    if (!plan) return false;

    return plan.modules.includes(moduleKey);
  }
}
