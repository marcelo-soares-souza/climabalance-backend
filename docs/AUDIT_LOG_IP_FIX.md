# Fix: Captura de IP e Contexto no Audit Log

## Problema

O audit log não estava capturando `client_ip`, `user_agent` e outros campos de contexto porque os handlers não estavam passando o `HttpContext`.

## Solução Implementada

### 1. Auto-extração de Contexto

O repositório agora aceita um parâmetro opcional `ctx` que extrai automaticamente:

- `clientIp` - do ctx.clientIp ou headers x-real-ip/x-forwarded-for
- `userAgent` - do header user-agent
- `requestId` - do ctx.requestId
- `referer` - dos headers referer/referrer

```typescript
await auditLog.log({
  actorUserId: userId,
  action: "user.login",
  entityType: "user",
  entityId: userId,
  ctx, // <-- Passa o HttpContext aqui!
  success: true,
  httpStatus: 200,
});
```

### 2. Status Atual

**Handlers HTTP atualizados:**

- ✅ `auth-handlers.ts` - Login já captura contexto completo
- ⚠️ `payment-handlers.ts` - Função helper interna (não crítico)

**Application Services:**

- ⏳ Ainda não atualizados (não têm acesso ao ctx)
- Não é crítico - continuam funcionando, apenas sem IP/user agent

## Como Atualizar Outros Handlers

### Exemplo: Handler HTTP

```typescript
async function handleSomeAction(ctx: HttpContext) {
  try {
    // ... lógica ...

    await deps.auditLog.log({
      actorUserId: ctx.auth!.userId,
      action: 'some.action',
      entityType: 'entity',
      entityId: 'id',
      ctx, // <-- Adicionar ctx aqui
      success: true,
      httpStatus: 200,
      severity: 'info',
      category: ['general'],
    });

    return jsonResponse(200, ...);
  } catch (error) {
    await deps.auditLog.log({
      actorUserId: ctx.auth?.userId ?? 'unknown',
      action: 'some.action_failed',
      entityType: 'entity',
      entityId: 'id',
      ctx, // <-- Também nos erros
      success: false,
      errorCode: error.code,
      httpStatus: 500,
      severity: 'error',
    });
    throw error;
  }
}
```

### Exemplo: Application Service (Opcional)

Para services que precisam de contexto:

```typescript
// No handler:
const auditContext = {
  ctx,
  success: true,
  httpStatus: 200,
  severity: "info" as const,
  category: ["compliance"],
};

await someApplicationService({
  ...params,
  auditContext, // Passar para o service
});

// No service:
interface ServiceInput {
  // ... outros params
  auditContext?: {
    ctx?: any;
    success?: boolean;
    httpStatus?: number;
    severity?: AuditLogSeverity;
    category?: string[];
  };
}

async function someApplicationService(input: ServiceInput) {
  // ... lógica ...

  await deps.auditLog.log({
    actorUserId: input.actorUserId,
    action: "action",
    entityType: "entity",
    entityId: "id",
    ...input.auditContext, // Spread do contexto
  });
}
```

## Verificar Captura

### Query de Teste

```sql
SELECT
  action,
  actor_email,
  client_ip,
  user_agent,
  request_id,
  success,
  severity,
  created_at
FROM audit_log
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 10;
```

### Teste Manual

1. Fazer login via frontend ou API
2. Executar a query acima
3. Verificar se `client_ip` e `user_agent` estão populados

## Próximos Passos

### Prioridade Alta

- [ ] Atualizar handlers de área (create, update, delete, approve, reject)
- [ ] Atualizar handlers de compensação
- [ ] Atualizar handlers de pagamento (webhook, reconcile)

### Prioridade Média

- [ ] Passar audit context para application services principais
- [ ] Adicionar testes para verificar captura de IP

### Prioridade Baixa

- [ ] Integrar com serviço GeoIP para country_code e city
- [ ] Adicionar session_id tracking

## Retrocompatibilidade

✅ A mudança é **100% retrocompatível**:

- Handlers que não passam `ctx` continuam funcionando
- Apenas não terão IP/user agent/request ID
- Podem ser atualizados gradualmente
