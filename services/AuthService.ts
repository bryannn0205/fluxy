import type { Company, User } from "@/lib/generated/prisma/client";
import { DEFAULT_PLAN_SLUG, TRIAL_DURATION_DAYS } from "@/lib/constants";
import { env } from "@/lib/env";
import { EmailAlreadyInUseError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createEmailVerificationToken } from "@/lib/tokens";
import { sendEmail, verifyEmailEmail } from "@/lib/email";
import type { CompanyRepository } from "@/repositories/interfaces/CompanyRepository";
import type { PlanRepository } from "@/repositories/interfaces/PlanRepository";
import type { UserRepository } from "@/repositories/interfaces/UserRepository";
import type { RegisterInput } from "@/schemas/auth.schema";
import type { AuditService } from "@/services/AuditService";

export class AuthService {
  constructor(
    private readonly companyRepository: CompanyRepository,
    private readonly userRepository: UserRepository,
    private readonly planRepository: PlanRepository,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Cadastra uma nova empresa e seu usuário OWNER, com trial de 14 dias.
   *
   * @throws {EmailAlreadyInUseError} Já existe um usuário com este e-mail
   */
  async register(input: RegisterInput): Promise<Company> {
    const existingUser = await this.userRepository.findByEmail(input.email);
    if (existingUser) {
      throw new EmailAlreadyInUseError();
    }

    const [passwordHash, defaultPlan] = await Promise.all([
      hashPassword(input.password),
      this.planRepository.findBySlug(DEFAULT_PLAN_SLUG),
    ]);

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DURATION_DAYS);

    const company = await this.companyRepository.createWithOwner({
      register: input,
      passwordHash,
      trialEndsAt,
      planId: defaultPlan?.id ?? null,
    });

    await this.auditService.log({
      companyId: company.id,
      action: "CREATE",
      resource: "company",
      resourceId: company.id,
    });

    // Falha ao enviar o e-mail de verificação não deve derrubar o cadastro
    // — a conta já foi criada e o usuário pode acessar o produto normalmente.
    try {
      const token = await createEmailVerificationToken(input.email);
      const verifyUrl = `${env.NEXT_PUBLIC_APP_URL}/verify-email?token=${token}`;
      await sendEmail(
        input.email,
        "Confirme seu e-mail — Fluxy",
        verifyEmailEmail(verifyUrl),
      );
    } catch (error) {
      logger.error("Falha ao enviar e-mail de verificação", {
        error,
        companyId: company.id,
      });
    }

    return company;
  }

  /** Retorna o usuário se as credenciais forem válidas, ou null caso contrário. */
  async verifyCredentials(email: string, password: string): Promise<User | null> {
    const user = await this.userRepository.findByEmail(email);
    if (!user?.passwordHash) return null;

    const isValid = await verifyPassword(user.passwordHash, password);
    return isValid ? user : null;
  }
}
