# 📦 Produto

## O Que é Fluxy?

**Fluxy** é um **SaaS Multi-Tenant de Gestão de Pedidos**.

Cada empresa (tenant) possui seu próprio ambiente isolado.

Todos os dados devem ser **completamente isolados**.

**Nenhum usuário poderá acessar informações pertencentes a outra empresa**, sob nenhuma circunstância.

## Características Principais

### Isolamento de Dados

- Cada tenant tem dados completamente isolados
- Banco de dados compartilhado, mas dados segregados por `companyId`
- Impossível vazar dados entre empresas
- Auditoria rigorosa de acesso

### Multi-Tenant

- Escalabilidade de dados
- Custo-benefício otimizado
- Compartilhamento eficiente de recursos
- Manutenção centralizada

### Gestão de Pedidos

- Criação e rastreamento de pedidos
- Status de processamento
- Histórico e auditoria
- Integrações futuras

## Evolução Futura

O produto deve evoluir futuramente para um **ERP completo**.

Toda a arquitetura deve ser pensada com essa evolução em mente:

### Fases Planejadas

1. **Fase 1 (Agora)** — Gestão de Pedidos
2. **Fase 2** — Gestão de Estoque
3. **Fase 3** — Gestão de Fornecedores
4. **Fase 4** — Financeiro (contas a pagar/receber)
5. **Fase 5** — RH & Folha de Pagamento
6. **Fase 6** — Análise & Business Intelligence

### Preparação Arquitetural

- Preparar pontos de extensão para módulos futuros
- Usar padrões que permitam crescimento modular
- Não acoplar lógica de forma rígida
- Preparar estrutura de permissões granulares
- Preparar sistema de auditoria completo

## Modelo de Negócio

### Assinaturas

- Planos por volume de pedidos
- Suporte técnico
- Features adicionais

### Pagamentos

- PIX
- Cartão de Crédito
- Boleto
- Assinaturas recorrentes via Asaas

### Webhooks

- Integrações com sistemas externos
- Notificações em tempo real
- APIs para parceiros

## Regras de Negócio Críticas

### Multi-Tenant é Inviolável

```
Regra: TODO dado obrigatoriamente pertence a uma empresa (tenant)
```

- Toda tabela deve possuir `companyId`
- Toda consulta deve filtrar por `companyId`
- Nunca confiar em parâmetros enviados pelo frontend
- Toda autorização deve ocorrer no backend
- Jamais permitir vazamento entre empresas

Esta é uma regra **OBRIGATÓRIA** que nunca pode ser violada.

### Segurança de Dados

- Dados sensíveis devem ser criptografados
- Senhas com hash Argon2
- Logs de auditoria para ações críticas
- Proteção contra força bruta
- Rate limiting

### Performance

- Suportar milhares de empresas
- Suportar centenas de milhões de pedidos
- Tempos de resposta < 200ms
- Cache inteligente
- Queries otimizadas

## Exemplo: Estrutura de Tabela

```sql
-- Exemplo obrigatório de estrutura multi-tenant
CREATE TABLE orders (
  id UUID PRIMARY KEY,
  companyId UUID NOT NULL,  -- Sempre presente
  orderNumber STRING NOT NULL,
  status STRING NOT NULL,
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP,
  deletedAt TIMESTAMP,  -- Soft delete quando apropriado

  -- Índice para queries rápidas
  UNIQUE(companyId, orderNumber),
  INDEX(companyId, status),
  INDEX(companyId, createdAt DESC)
);
```

---

**Ver também:**

- [Multi-tenant Architecture](../architecture/multi-tenant.md)
- [Security](../features/security.md)
- [Database](../tech-stack/database.md)
