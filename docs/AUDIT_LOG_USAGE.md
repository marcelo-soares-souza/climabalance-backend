# Audit Log - Guia de Uso

Este documento explica como usar o sistema de audit log enriquecido para capturar informações completas de auditoria.

## Campos Disponíveis

### Campos Básicos (já existentes)
- `actorUserId` - ID do usuário que executou a ação
- `actorEmail` - Email do usuário (denormalizado)
- `clientIp` - Endereço IP do cliente
- `action` - Ação executada (ex: `auth.login`, `area.approve`)
- `entityType` - Tipo de entidade afetada (ex: `user`, `area`, `payment`)
- `entityId` - ID da entidade afetada
- `reason` - Razão ou metadados adicionais (JSON)

### Novos Campos - Contexto da Requisição
- `userAgent` - Navegador/dispositivo usado
- `requestId` - ID único da requisição (correlação com logs)
- `sessionId` - ID da sessão do usuário
- `referer` - URL de origem da requisição

### Novos Campos - Resultado da Operação
- `success` - Operação bem-sucedida? (boolean)
- `errorCode` - Código do erro (se falhou)
- `httpStatus` - Status HTTP da resposta

### Novos Campos - Geolocalização
- `countryCode` - Código do país (ISO 3166-1 alpha-2)
- `city` - Cidade aproximada
- `timezone` - Timezone do cliente

### Novos Campos - Criticidade
- `severity` - Nível: `debug`, `info`, `warning`, `error`, `critical`
- `category` - Categorias: `financial`, `security`, `compliance`, `data_modification`, etc.
- `isSensitive` - Operação sensível que requer atenção especial

### Novos Campos - Rastreamento de Estado
- `previousState` - Estado anterior (JSON, sanitizado)
- `newState` - Novo estado (JSON, sanitizado)
- `changedFields` - Lista de campos modificados

### Novos Campos - Performance
- `durationMs` - Duração da operação em milissegundos
- `resourceChanges` - Número de registros afetados

## Como Usar

### Exemplo Básico (Automático)

Use as funções helper para extrair automaticamente o contexto:

\`\`\`typescript
import { extractAuditContext, categorizeAuditEntry, determineSeverity, isSensitiveOperation } from '../../shared/http/audit-context';

async function handleLogin(ctx: HttpContext) {
  const startTime = Date.now();
  const auditContext = extractAuditContext(ctx);

  try {
    // ... lógica de login ...
    const user = await authenticateUser(email, password);

    await auditLog.log({
      actorUserId: user.id,
      action: 'auth.login_success',
      entityType: 'user',
      entityId: user.id,
      ...auditContext,
      success: true,
      httpStatus: 200,
      severity: 'info',
      category: ['security'],
      durationMs: Date.now() - startTime,
    });

    return jsonResponse(200, { token: ... });
  } catch (error) {
    await auditLog.log({
      actorUserId: email, // se não tiver userId ainda
      action: 'auth.login_failed',
      entityType: 'user',
      entityId: email,
      ...auditContext,
      success: false,
      errorCode: error.code,
      httpStatus: 401,
      severity: 'warning',
      category: ['security'],
      durationMs: Date.now() - startTime,
    });

    throw error;
  }
}
\`\`\`

### Exemplo com Rastreamento de Estado

Para operações que modificam dados (UPDATE, PATCH):

\`\`\`typescript
async function updateArea(ctx: HttpContext, areaId: string) {
  const auditContext = extractAuditContext(ctx);

  // Buscar estado anterior
  const previousArea = await areaRepository.findById(areaId);
  const previousState = {
    status: previousArea.status,
    name: previousArea.name,
    totalCapacity: previousArea.totalCapacity,
  };

  // Aplicar mudanças
  const updates = parseUpdates(ctx.request);
  const updatedArea = await areaRepository.update(areaId, updates);

  // Determinar campos modificados
  const changedFields = Object.keys(updates);

  const newState = {
    status: updatedArea.status,
    name: updatedArea.name,
    totalCapacity: updatedArea.totalCapacity,
  };

  await auditLog.log({
    actorUserId: ctx.auth!.userId,
    action: 'area.updated',
    entityType: 'area',
    entityId: areaId,
    ...auditContext,
    success: true,
    httpStatus: 200,
    severity: 'info',
    category: categorizeAuditEntry('area.updated', 'area'),
    isSensitive: isSensitiveOperation('area.updated', 'area'),
    previousState,
    newState,
    changedFields,
    resourceChanges: 1,
  });
}
\`\`\`

### Exemplo de Operação Crítica

Para operações críticas (delete, suspend, revoke):

\`\`\`typescript
async function suspendArea(ctx: HttpContext, areaId: string) {
  const auditContext = extractAuditContext(ctx);
  const reason = ctx.request.body?.reason;

  await areaRepository.suspend(areaId, reason);

  await auditLog.log({
    actorUserId: ctx.auth!.userId,
    action: 'area.suspended',
    entityType: 'area',
    entityId: areaId,
    ...auditContext,
    success: true,
    httpStatus: 200,
    severity: 'warning', // operação crítica
    category: ['compliance', 'data_modification'],
    isSensitive: true,
    metadata: { reason },
  });
}
\`\`\`

## Sanitização Automática

O sistema **sanitiza automaticamente** campos sensíveis em `previousState` e `newState`:

Campos removidos:
- `password`, `passwd`, `pwd`
- `token`, `access_token`, `refresh_token`, `api_key`
- `secret`, `private_key`
- `cvv`, `card_number`
- `ssn`, `cpf`, `cnpj`

Esses campos são substituídos por `[REDACTED]` no audit log.

## Queries Úteis

### Falhas de login nas últimas 24h
\`\`\`sql
SELECT actor_email, client_ip, country_code, COUNT(*)
FROM audit_log
WHERE action = 'auth.login_failed'
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY actor_email, client_ip, country_code
ORDER BY COUNT(*) DESC;
\`\`\`

### Operações críticas por usuário
\`\`\`sql
SELECT actor_email, action, entity_type, created_at
FROM audit_log
WHERE severity IN ('warning', 'critical')
  AND created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;
\`\`\`

### Mudanças em valores financeiros
\`\`\`sql
SELECT
  actor_email,
  entity_id,
  previous_state->>'total_amount' as old_value,
  new_state->>'total_amount' as new_value,
  created_at
FROM audit_log
WHERE entity_type = 'compensation'
  AND 'total_amount' = ANY(changed_fields)
ORDER BY created_at DESC;
\`\`\`

### Acessos de países incomuns
\`\`\`sql
SELECT DISTINCT country_code, COUNT(*) as access_count
FROM audit_log
WHERE country_code NOT IN ('BR', 'US', 'PT')
  AND created_at > NOW() - INTERVAL '30 days'
GROUP BY country_code
ORDER BY access_count DESC;
\`\`\`

## Boas Práticas

1. **Sempre capture contexto HTTP**: Use `extractAuditContext(ctx)` em todos os handlers
2. **Registre sucesso E falha**: Não registre apenas erros, registre também sucessos para ter audit trail completo
3. **Use severity apropriada**: Operações críticas devem ter `severity: 'warning'` ou `'critical'`
4. **Categorize corretamente**: Use `categorizeAuditEntry()` para categorização automática
5. **Capture duração**: Use `Date.now()` no início e calcule `durationMs` para detectar operações lentas
6. **Rastreie mudanças de estado**: Para UPDATEs, sempre capture `previousState`, `newState`, e `changedFields`
7. **Não logue dados sensíveis**: A sanitização automática ajuda, mas evite passar senhas/tokens explicitamente

## Compliance

Este sistema de audit log atende aos requisitos de:
- **SOC 2** - Rastreamento completo de acessos e modificações
- **ISO 27001** - Logging de eventos de segurança
- **LGPD/GDPR** - Rastreamento de quem acessou/modificou dados pessoais
- **PCI DSS** - Logging de transações financeiras e acessos

## Performance

Os índices criados otimizam queries comuns:
- Busca por falhas: `idx_audit_log_success`
- Busca por severidade: `idx_audit_log_severity`
- Busca por país: `idx_audit_log_country`
- Busca por request: `idx_audit_log_request_id`
- Busca por categoria: `idx_audit_log_category` (GIN)
- Busca por campos modificados: `idx_audit_log_changed_fields` (GIN)
