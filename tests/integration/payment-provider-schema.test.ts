import { randomUUID } from "crypto";

import { afterAll, describe, expect, it } from "vitest";

import { DEFAULT_PLAN_SLUG } from "@/lib/constants";
import { PrismaCompanyRepository } from "@/repositories/implementations/PrismaCompanyRepository";
import { PrismaPlanRepository } from "@/repositories/implementations/PrismaPlanRepository";
import { PrismaUserRepository } from "@/repositories/implementations/PrismaUserRepository";
import { AuditService } from "@/services/AuditService";
import { AuthService } from "@/services/AuthService";

import { createTestPrismaClient } from "../helpers/prisma";

const prisma = createTestPrismaClient();

const authService = prisma
  ? new AuthService(
      new PrismaCompanyRepository(prisma),
      new PrismaUserRepository(prisma),
      new PrismaPlanRepository(prisma),
      new AuditService(prisma),
    )
  : null;

const empresas: string[] = [];

afterAll(async () => {
  if (prisma && empresas.length > 0) {
    await prisma.paymentProviderEvent.deleteMany({
      where: { companyId: { in: empresas } },
    });
    await prisma.subscriptionCheckout.deleteMany({
      where: { companyId: { in: empresas } },
    });
    await prisma.auditLog.deleteMany({ where: { companyId: { in: empresas } } });
    await prisma.user.deleteMany({ where: { companyId: { in: empresas } } });
    await prisma.company.deleteMany({ where: { id: { in: empresas } } });
  }
  await prisma?.$disconnect();
});

async function novaEmpresa() {
  const sufixo = randomUUID().slice(0, 8);
  const company = await authService!.register({
    companyName: `Empresa ${sufixo}`,
    name: `Dono ${sufixo}`,
    email: `dono-${sufixo}@teste.com`,
    password: "SenhaForte123!",
  });
  empresas.push(company.id);
  return company;
}

async function planoPadrao() {
  return prisma!.plan.findUniqueOrThrow({ where: { slug: DEFAULT_PLAN_SLUG } });
}

describe.skipIf(!prisma)("Payment continua intacto", () => {
  it("orderId e createdById seguem obrigatórios e NOT NULL", async () => {
    const colunas = await prisma!.$queryRaw<
      { column_name: string; is_nullable: string }[]
    >`
      SELECT column_name, is_nullable FROM information_schema.columns
      WHERE table_name = 'Payment' AND column_name IN ('orderId', 'createdById', 'companyId')
      ORDER BY column_name`;

    // A F2 não podia enfraquecer estas invariantes para reaproveitar o ledger
    // de pedidos em assinatura. Pagamento de assinatura não tem pedido nem
    // autor humano — por isso ganhou tabelas próprias.
    expect(colunas).toHaveLength(3);
    for (const coluna of colunas) {
      expect(coluna.is_nullable).toBe("NO");
    }
  });

  it("nenhuma coluna de provedor foi acrescentada ao Payment", async () => {
    const colunas = await prisma!.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'Payment'`;
    const nomes = colunas.map((c) => c.column_name);

    for (const proibido of ["provider", "externalChargeId", "subscriptionId"]) {
      expect(nomes).not.toContain(proibido);
    }
  });
});

describe.skipIf(!prisma)("colunas novas", () => {
  it("os identificadores de provedor em Company são nullable", async () => {
    const colunas = await prisma!.$queryRaw<
      { column_name: string; is_nullable: string }[]
    >`
      SELECT column_name, is_nullable FROM information_schema.columns
      WHERE table_name = 'Company'
        AND column_name IN ('validapayCustomerId', 'validapaySubscriptionId')`;

    expect(colunas).toHaveLength(2);
    expect(colunas.every((c) => c.is_nullable === "YES")).toBe(true);
  });

  it("as colunas asaas* CONTINUAM existindo — a migration é aditiva", async () => {
    const colunas = await prisma!.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'Company' AND column_name LIKE 'asaas%'
      ORDER BY column_name`;

    // Renomear preservaria os bytes mas trocaria o SIGNIFICADO: um
    // identificador do Asaas passaria a se chamar ValidaPay, e nada acusaria
    // a troca. Como não se prova pelo repositório que todo banco tem NULL
    // ali, as colunas ficam até uma verificação explícita da produção.
    expect(colunas.map((c) => c.column_name)).toEqual([
      "asaasCustomerId",
      "asaasSubscriptionId",
    ]);
  });

  it("Asaas e ValidaPay coexistem, sem cópia entre eles", async () => {
    const empresa = await novaEmpresa();

    // Empresa recém-criada: os quatro campos nascem nulos, e nenhum deles é
    // derivado do outro.
    const lida = await prisma!.company.findUniqueOrThrow({ where: { id: empresa.id } });
    expect(lida.asaasCustomerId).toBeNull();
    expect(lida.validapayCustomerId).toBeNull();

    // Gravar do lado Asaas não contamina o lado ValidaPay.
    await prisma!.company.update({
      where: { id: empresa.id },
      data: { asaasCustomerId: "cus_asaas_teste" },
    });
    const depois = await prisma!.company.findUniqueOrThrow({ where: { id: empresa.id } });

    expect(depois.asaasCustomerId).toBe("cus_asaas_teste");
    expect(depois.validapayCustomerId).toBeNull();
  });

  it("a migration da F2 não contém DROP nem RENAME", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const { join } = await import("node:path");

    const pasta = readdirSync(join(process.cwd(), "prisma", "migrations")).find((n) =>
      n.endsWith("_validapay_integration"),
    )!;
    const sql = readFileSync(
      join(process.cwd(), "prisma", "migrations", pasta, "migration.sql"),
      "utf8",
    )
      .split("\n")
      .filter((linha) => !linha.trimStart().startsWith("--"))
      .join("\n");

    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/\bRENAME\b/i);
    expect(sql).toContain('ADD COLUMN     "validapayCustomerId"');
    // Transação explícita: o Prisma não envolve migrations sozinho.
    expect(sql).toContain("BEGIN;");
    expect(sql).toContain("COMMIT;");
  });

  it("os identificadores de preço em Plan são nullable e independentes", async () => {
    const plano = await planoPadrao();

    expect(plano.validapayPriceMonthlyId).toBeNull();
    expect(plano.validapayPriceYearlyId).toBeNull();

    // Um pode ser preenchido sem o outro.
    await prisma!.plan.update({
      where: { id: plano.id },
      data: { validapayPriceMonthlyId: "price_teste_mensal" },
    });
    const depois = await prisma!.plan.findUniqueOrThrow({ where: { id: plano.id } });
    expect(depois.validapayPriceMonthlyId).toBe("price_teste_mensal");
    expect(depois.validapayPriceYearlyId).toBeNull();

    await prisma!.plan.update({
      where: { id: plano.id },
      data: { validapayPriceMonthlyId: null },
    });
  });
});

describe.skipIf(!prisma)("tentativa de contratação", () => {
  it("pertence a uma empresa e registra plano pretendido e periodicidade", async () => {
    const empresa = await novaEmpresa();
    const plano = await planoPadrao();

    const tentativa = await prisma!.subscriptionCheckout.create({
      data: {
        companyId: empresa.id,
        intendedPlanId: plano.id,
        billingInterval: "YEARLY",
        provider: "VALIDAPAY",
      },
    });

    expect(tentativa.companyId).toBe(empresa.id);
    expect(tentativa.intendedPlanId).toBe(plano.id);
    expect(tentativa.billingInterval).toBe("YEARLY");
    expect(tentativa.status).toBe("PENDING");
    expect(tentativa.completedAt).toBeNull();
  });

  it("criar tentativa NÃO altera o plano nem o status da empresa", async () => {
    const empresa = await novaEmpresa();
    const antes = await prisma!.company.findUniqueOrThrow({ where: { id: empresa.id } });
    const pro = await prisma!.plan.findUniqueOrThrow({ where: { slug: "pro" } });

    // Intenção de Pro, explicitamente.
    await prisma!.subscriptionCheckout.create({
      data: {
        companyId: empresa.id,
        intendedPlanId: pro.id,
        billingInterval: "MONTHLY",
        provider: "VALIDAPAY",
      },
    });

    const depois = await prisma!.company.findUniqueOrThrow({ where: { id: empresa.id } });

    expect(depois.planId).toBe(antes.planId);
    expect(depois.planId).not.toBe(pro.id);
    expect(depois.subscriptionStatus).toBe("TRIALING");
    expect(depois.validapaySubscriptionId).toBeNull();
  });

  it("a mesma sessão externa não pode ser registrada duas vezes", async () => {
    const empresa = await novaEmpresa();
    const plano = await planoPadrao();
    const sessao = `sess_${randomUUID()}`;

    await prisma!.subscriptionCheckout.create({
      data: {
        companyId: empresa.id,
        intendedPlanId: plano.id,
        billingInterval: "MONTHLY",
        provider: "VALIDAPAY",
        externalSessionId: sessao,
      },
    });

    // Dois registros apontando para a mesma sessão tornariam a correlação
    // ambígua justamente na hora de conceder o plano.
    await expect(
      prisma!.subscriptionCheckout.create({
        data: {
          companyId: empresa.id,
          intendedPlanId: plano.id,
          billingInterval: "MONTHLY",
          provider: "VALIDAPAY",
          externalSessionId: sessao,
        },
      }),
    ).rejects.toThrow();
  });
});

describe.skipIf(!prisma)("unicidade é composta com o provedor", () => {
  it("os índices únicos incluem a coluna provider", async () => {
    // `_pkey` fora: pg_indexes também marca chave primária como UNIQUE, e a
    // primária é o `id`, que não tem nada a ver com identificador externo.
    const indices = await prisma!.$queryRaw<{ indexname: string; indexdef: string }[]>`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE tablename IN ('SubscriptionCheckout', 'PaymentProviderEvent')
        AND indexdef LIKE '%UNIQUE%'
        AND indexname NOT LIKE '%\_pkey'
      ORDER BY indexname`;

    // Identificador de terceiro não tem unicidade global documentada. Único
    // sem o provedor criaria colisão inexplicável no dia de um segundo gateway.
    expect(indices).toHaveLength(3);
    for (const indice of indices) {
      expect(indice.indexdef).toContain("provider");
    }
  });

  it("a mesma idempotencyKey é aceita para provedores diferentes", async () => {
    const chave = `evt_${randomUUID()}`;

    await prisma!.paymentProviderEvent.create({
      data: {
        provider: "VALIDAPAY",
        eventType: "payment.success",
        idempotencyKey: chave,
      },
    });

    // Hoje só existe VALIDAPAY na enum, então este teste verifica a ESTRUTURA
    // do índice: a chave sozinha não é única, o par com o provedor é.
    const definicao = await prisma!.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes
      WHERE tablename = 'PaymentProviderEvent' AND indexname LIKE '%idempotencyKey%'`;

    expect(definicao[0]!.indexdef).toMatch(/provider.*idempotencyKey/);

    await prisma!.paymentProviderEvent.deleteMany({ where: { idempotencyKey: chave } });
  });
});

describe.skipIf(!prisma)("eventos do provedor", () => {
  it("a idempotencyKey é única — evento duplicado é recusado pelo banco", async () => {
    const chave = `evt_${randomUUID()}`;

    await prisma!.paymentProviderEvent.create({
      data: {
        provider: "VALIDAPAY",
        eventType: "payment.success",
        idempotencyKey: chave,
      },
    });

    // Estrutural, não checagem de código que se possa esquecer de chamar.
    await expect(
      prisma!.paymentProviderEvent.create({
        data: {
          provider: "VALIDAPAY",
          eventType: "payment.success",
          idempotencyKey: chave,
        },
      }),
    ).rejects.toThrow();

    await prisma!.paymentProviderEvent.deleteMany({ where: { idempotencyKey: chave } });
  });

  it("aceita evento sem empresa correlacionada", async () => {
    const chave = `evt_${randomUUID()}`;
    const evento = await prisma!.paymentProviderEvent.create({
      data: { provider: "VALIDAPAY", eventType: "payment.failed", idempotencyKey: chave },
    });

    // Cobrança desconhecida precisa ser registrável: perder o evento é perder
    // a única evidência de que algo estranho chegou.
    expect(evento.companyId).toBeNull();
    expect(evento.status).toBe("PENDING");
    expect(evento.processedAt).toBeNull();

    await prisma!.paymentProviderEvent.delete({ where: { id: evento.id } });
  });

  it("aceita tipo de evento desconhecido — eventType é texto, não enum", async () => {
    const chave = `evt_${randomUUID()}`;
    const evento = await prisma!.paymentProviderEvent.create({
      data: {
        provider: "VALIDAPAY",
        eventType: "subscription.algo.que.ainda.nao.existe",
        idempotencyKey: chave,
      },
    });

    // Com enum, o Postgres recusaria a linha e o Fluxy perderia o registro de
    // que apareceu algo novo — exatamente quando mais precisaria saber.
    expect(evento.eventType).toBe("subscription.algo.que.ainda.nao.existe");
    await prisma!.paymentProviderEvent.delete({ where: { id: evento.id } });
  });

  it("não existe coluna para dado sensível do pagador", async () => {
    const colunas = await prisma!.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'PaymentProviderEvent'`;
    const nomes = colunas.map((c) => c.column_name.toLowerCase());

    for (const proibido of [
      "taxid",
      "account",
      "bank",
      "branch",
      "cardnumber",
      "cvv",
      "payer",
      "payload",
      "cpf",
      "cnpj",
    ]) {
      expect(nomes.filter((n) => n === proibido)).toHaveLength(0);
    }
    // `payloadHash` existe; `payload` bruto não.
    expect(nomes).toContain("payloadhash");
  });
});

describe.skipIf(!prisma)("isolamento entre empresas", () => {
  it("consulta escopada não devolve tentativa de outra empresa", async () => {
    const a = await novaEmpresa();
    const b = await novaEmpresa();
    const plano = await planoPadrao();

    const deB = await prisma!.subscriptionCheckout.create({
      data: {
        companyId: b.id,
        intendedPlanId: plano.id,
        billingInterval: "MONTHLY",
        provider: "VALIDAPAY",
      },
    });

    const vistasPorA = await prisma!.subscriptionCheckout.findMany({
      where: { companyId: a.id },
    });

    expect(vistasPorA.map((t) => t.id)).not.toContain(deB.id);
  });

  it("um id externo conhecido não vaza dados de outra empresa", async () => {
    const a = await novaEmpresa();
    const b = await novaEmpresa();
    const plano = await planoPadrao();
    const sessao = `sess_${randomUUID()}`;

    await prisma!.subscriptionCheckout.create({
      data: {
        companyId: b.id,
        intendedPlanId: plano.id,
        billingInterval: "MONTHLY",
        provider: "VALIDAPAY",
        externalSessionId: sessao,
      },
    });

    // Mesmo sabendo o id da sessão de B, a consulta escopada em A não devolve
    // nada: o filtro por companyId continua sendo a barreira, e o id externo
    // sozinho não é chave de acesso.
    const tentativa = await prisma!.subscriptionCheckout.findFirst({
      where: { externalSessionId: sessao, companyId: a.id },
    });

    expect(tentativa).toBeNull();
  });

  it("evento de uma empresa não aparece na consulta da outra", async () => {
    const a = await novaEmpresa();
    const b = await novaEmpresa();
    const chave = `evt_${randomUUID()}`;

    await prisma!.paymentProviderEvent.create({
      data: {
        provider: "VALIDAPAY",
        eventType: "payment.success",
        idempotencyKey: chave,
        companyId: b.id,
      },
    });

    const vistosPorA = await prisma!.paymentProviderEvent.findMany({
      where: { companyId: a.id },
    });

    expect(vistosPorA.map((e) => e.idempotencyKey)).not.toContain(chave);
  });

  it("a empresa não some por cascata — RESTRICT protege o histórico", async () => {
    const empresa = await novaEmpresa();
    const plano = await planoPadrao();

    await prisma!.subscriptionCheckout.create({
      data: {
        companyId: empresa.id,
        intendedPlanId: plano.id,
        billingInterval: "MONTHLY",
        provider: "VALIDAPAY",
      },
    });

    // Exclusão física da empresa é recusada enquanto houver histórico de
    // cobrança — como em Payment e StockMovement.
    await expect(prisma!.company.delete({ where: { id: empresa.id } })).rejects.toThrow();
  });
});
