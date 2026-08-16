import type { Role } from "@/lib/generated/prisma/client";
import { ForbiddenError } from "@/lib/errors";

/**
 * Matriz de permissões do Fluxy — fonte única sobre quem pode o quê.
 *
 * É uma tabela declarativa, e não `if (role === ...)` espalhado pelos services,
 * por uma razão prática: permissão espalhada por onze services é permissão que
 * ninguém consegue auditar. Aqui a resposta para "quem pode excluir pedido?"
 * cabe numa linha, e uma revisão de segurança lê o arquivo inteiro de uma vez.
 *
 * As ações são granulares de propósito. `orders:view` e `orders:viewFinancials`
 * são separadas porque VIEWER precisa acompanhar a operação — número, cliente,
 * itens, status, prazo — sem enxergar preço, desconto ou total. Bloquear só o
 * relatório enquanto os mesmos valores continuam no pedido seria teatro.
 *
 * **Esta tabela é o portão, não a decoração.** A interface esconde o que o
 * papel não permite, mas quem barra de fato é o service. Ver os guards em
 * services/* e a redação de campos em types/orders.ts e types/products.ts.
 */
const PERMISSIONS = {
  orders: {
    /** Dados operacionais: número, cliente, itens, quantidade, status, prazo. */
    view: ["OWNER", "ADMIN", "MANAGER", "OPERATOR", "FINANCE", "VIEWER"],
    /**
     * Preço unitário, subtotal, desconto, total e forma de pagamento.
     *
     * OPERATOR e MANAGER saíram por menor privilégio. O operador executa o
     * pedido — itens, quantidade, prazo, observação — e nada disso exige saber
     * quanto o cliente pagou. O gerente conduz a operação, e a política do
     * produto passou a separar conduzir de enxergar dinheiro.
     */
    viewFinancials: ["OWNER", "ADMIN", "FINANCE"],
    create: ["OWNER", "ADMIN", "MANAGER", "OPERATOR"],
    update: ["OWNER", "ADMIN", "MANAGER", "OPERATOR"],
    updateStatus: ["OWNER", "ADMIN", "MANAGER", "OPERATOR"],
    // Exclusão devolve estoque e consome número de pedido — é ação de gestão,
    // não de balcão.
    delete: ["OWNER", "ADMIN", "MANAGER"],
    // Ler na tela é uma coisa; levar a base de clientes e faturamento num
    // arquivo é outra. É o vetor clássico de saída de dados.
    //
    // MANAGER saiu junto com `viewFinancials`: o CSV carrega subtotal,
    // desconto, total, valor pago e forma de pagamento (ver OrderExportRow em
    // types/orders.ts). Mantê-lo aqui devolveria pela exportação exatamente o
    // que a tela deixou de mostrar.
    export: ["OWNER", "ADMIN", "FINANCE"],
  },

  products: {
    /** Nome, SKU, unidade, estoque e preço de venda. */
    view: ["OWNER", "ADMIN", "MANAGER", "OPERATOR", "FINANCE", "VIEWER"],
    /** Custo de aquisição e, por consequência, a margem. */
    viewCosts: ["OWNER", "ADMIN", "MANAGER", "FINANCE"],
    create: ["OWNER", "ADMIN", "MANAGER"],
    update: ["OWNER", "ADMIN", "MANAGER"],
    delete: ["OWNER", "ADMIN", "MANAGER"],
  },

  customers: {
    view: ["OWNER", "ADMIN", "MANAGER", "OPERATOR", "FINANCE", "VIEWER"],
    // OPERATOR cadastra cliente no balcão para conseguir fechar o pedido.
    create: ["OWNER", "ADMIN", "MANAGER", "OPERATOR"],
    update: ["OWNER", "ADMIN", "MANAGER", "OPERATOR"],
    delete: ["OWNER", "ADMIN", "MANAGER"],
  },

  stock: {
    view: ["OWNER", "ADMIN", "MANAGER", "OPERATOR", "FINANCE", "VIEWER"],
    // Ajuste manual altera inventário sem pedido por trás — é exatamente onde
    // mercadoria some sem rastro. A baixa automática por pedido continua
    // dentro do OrderService, sob a permissão de pedidos.
    adjust: ["OWNER", "ADMIN", "MANAGER"],
  },

  production: {
    view: ["OWNER", "ADMIN", "MANAGER", "OPERATOR", "FINANCE", "VIEWER"],
    // Mover cartão é updateStatus: mesma permissão de pedidos, para não haver
    // caminho lateral que contorne a regra.
    updateStage: ["OWNER", "ADMIN", "MANAGER", "OPERATOR"],
  },

  reports: {
    /** Contagens e prazos, sem valor monetário. */
    viewOperational: ["OWNER", "ADMIN", "MANAGER", "OPERATOR", "FINANCE", "VIEWER"],
    /**
     * Faturamento, ticket médio, ranking por receita.
     *
     * Também governa o indicador de faturamento do painel: é o mesmo dado, e
     * criar uma `dashboard:viewFinancial` só para ele daria dois nomes para uma
     * decisão — o tipo de duplicata que faz as duas divergirem com o tempo.
     */
    viewSales: ["OWNER", "ADMIN", "FINANCE"],
    /** Contas a receber, fluxo de caixa, inadimplência. */
    viewFinancial: ["OWNER", "ADMIN", "FINANCE"],
  },

  finance: {
    view: ["OWNER", "ADMIN", "FINANCE"],
    registerPayment: ["OWNER", "ADMIN", "FINANCE"],
    // Estorno e cancelamento desfazem dinheiro já conciliado.
    refund: ["OWNER", "ADMIN", "FINANCE"],
  },

  attachments: {
    view: ["OWNER", "ADMIN", "MANAGER", "OPERATOR", "FINANCE", "VIEWER"],
    // Anexo costuma ser comprovante ou arte de produção — OPERATOR precisa subir.
    create: ["OWNER", "ADMIN", "MANAGER", "OPERATOR"],
    // Apagar prova documental é gestão.
    delete: ["OWNER", "ADMIN", "MANAGER"],
  },

  team: {
    view: ["OWNER", "ADMIN"],
    invite: ["OWNER", "ADMIN"],
    updateRole: ["OWNER", "ADMIN"],
    remove: ["OWNER", "ADMIN"],
  },

  settings: {
    updateCompany: ["OWNER", "ADMIN"],
  },

  subscription: {
    // FINANCE vê para conciliar a despesa; não contrata.
    view: ["OWNER", "ADMIN", "FINANCE"],
    // Ação contratual é do dono. Alterar plano ou cancelar muda o que a
    // empresa paga — nem ADMIN assina isso pelo OWNER.
    manage: ["OWNER"],
  },
} as const satisfies Record<string, Record<string, readonly Role[]>>;

/**
 * Ordem de senioridade, usada só para decidir quem pode atribuir qual papel.
 *
 * Não é uma hierarquia de capacidades — quem pode o quê está na matriz acima,
 * e FINANCE não é "mais" que OPERATOR: são escopos diferentes, por isso empatam.
 * O que este número resolve é a escalada de privilégio: sem ele, um ADMIN
 * promoveria alguém a OWNER e teria, por interposta pessoa, um poder que ele
 * mesmo não tem.
 */
const ROLE_RANK: Record<Role, number> = {
  OWNER: 5,
  ADMIN: 4,
  MANAGER: 3,
  FINANCE: 2,
  OPERATOR: 2,
  VIEWER: 1,
};

/** Ninguém atribui papel mais sênior que o próprio. */
export function canAssignRole(actingRole: Role, targetRole: Role): boolean {
  return ROLE_RANK[targetRole] <= ROLE_RANK[actingRole];
}

export type Resource = keyof typeof PERMISSIONS;
export type ActionOf<R extends Resource> = keyof (typeof PERMISSIONS)[R];

/**
 * Responde se o papel pode executar a ação. Use para decidir o que renderizar.
 * Para barrar execução, use {@link assertPermission} — resposta booleana
 * ignorada por engano é um portão que não fecha.
 */
export function can<R extends Resource>(
  role: Role,
  resource: R,
  action: ActionOf<R>,
): boolean {
  const allowed = PERMISSIONS[resource][action] as readonly Role[];
  return allowed.includes(role);
}

/**
 * Barra a execução quando o papel não tem a permissão.
 *
 * A mensagem nomeia recurso e ação para o log ser diagnosticável; o que chega
 * ao usuário é o `userMessage` genérico de ForbiddenError, sem revelar o mapa
 * de permissões a quem está sondando.
 *
 * @throws {ForbiddenError} 403
 */
export function assertPermission<R extends Resource>(
  role: Role,
  resource: R,
  action: ActionOf<R>,
): void {
  if (!can(role, resource, action)) {
    throw new ForbiddenError(
      `Papel ${role} não tem permissão para ${String(resource)}:${String(action)}`,
    );
  }
}
