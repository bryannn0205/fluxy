import type { Company, Customer } from "@/lib/generated/prisma/client";
import { NotFoundError } from "@/lib/errors";
import type {
  CustomerRepository,
  CustomerStats,
} from "@/repositories/interfaces/CustomerRepository";
import type { CreateCustomerInput, UpdateCustomerInput } from "@/schemas/customer.schema";
import type { ListOptions, PaginatedResult } from "@/types/common";
import type { AuditService } from "@/services/AuditService";
import type { SubscriptionGateService } from "@/services/SubscriptionGateService";

type GateCompany = Pick<Company, "subscriptionStatus" | "trialEndsAt">;

export class CustomerService {
  constructor(
    private readonly repository: CustomerRepository,
    private readonly auditService: AuditService,
    private readonly subscriptionGate: SubscriptionGateService,
  ) {}

  async create(
    input: CreateCustomerInput,
    company: GateCompany & { id: string },
    userId: string,
  ): Promise<Customer> {
    this.subscriptionGate.assertCanWrite(company);

    const customer = await this.repository.create(input, company.id);

    await this.auditService.log({
      companyId: company.id,
      userId,
      action: "CREATE",
      resource: "customer",
      resourceId: customer.id,
    });

    return customer;
  }

  async update(
    id: string,
    input: UpdateCustomerInput,
    company: GateCompany & { id: string },
    userId: string,
  ): Promise<Customer> {
    this.subscriptionGate.assertCanWrite(company);

    const customer = await this.repository.update(id, company.id, input);

    await this.auditService.log({
      companyId: company.id,
      userId,
      action: "UPDATE",
      resource: "customer",
      resourceId: customer.id,
    });

    return customer;
  }

  async delete(
    id: string,
    company: GateCompany & { id: string },
    userId: string,
  ): Promise<void> {
    this.subscriptionGate.assertCanWrite(company);

    const customer = await this.repository.findById(id, company.id);
    if (!customer) {
      throw new NotFoundError("Cliente");
    }

    await this.repository.softDelete(id, company.id);

    await this.auditService.log({
      companyId: company.id,
      userId,
      action: "DELETE",
      resource: "customer",
      resourceId: id,
    });
  }

  async findById(id: string, companyId: string): Promise<Customer | null> {
    return this.repository.findById(id, companyId);
  }

  async list(
    companyId: string,
    options: ListOptions,
  ): Promise<PaginatedResult<Customer>> {
    return this.repository.list(companyId, options);
  }

  async listActive(companyId: string): Promise<Customer[]> {
    return this.repository.listActive(companyId);
  }

  async getStats(customerId: string, companyId: string): Promise<CustomerStats> {
    return this.repository.getStats(customerId, companyId);
  }
}
