# Migrations - Estrutura e Convenções

## Estado Atual - Todas Idempotentes ✅

Todas as migrações do projeto são **completamente idempotentes** e podem ser executadas múltiplas vezes sem erro.

## Ordem de Execução

```
001_init_schema.sql                    ✅ Idempotente
002_add_password_reset_tokens.sql      ✅ Idempotente
003_update_footprint_schema.sql        ✅ Idempotente
004_seed_emission_factors.sql          ✅ Idempotente (ON CONFLICT DO NOTHING)
005_create_areas_schema.sql            ✅ Idempotente (nova versão corrigida)
006_area_criteria_documentation.sql    ✅ Documentation-only
```

## Técnicas de Idempotência Usadas

### 1. CREATE TABLE IF NOT EXISTS
```sql
CREATE TABLE IF NOT EXISTS areas (
  id VARCHAR(36) PRIMARY KEY,
  ...
);
```

### 2. Verificação de Colunas com DO $$
```sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='areas' AND column_name='audit_status') THEN
    ALTER TABLE areas ADD COLUMN audit_status VARCHAR(30);
  END IF;
END $$;
```

### 3. DROP ... IF EXISTS antes de CREATE
```sql
ALTER TABLE areas DROP CONSTRAINT IF EXISTS check_status;
ALTER TABLE areas ADD CONSTRAINT check_status
  CHECK (status IN ('draft', 'pending_audit', ...));
```

### 4. CREATE INDEX IF NOT EXISTS
```sql
CREATE INDEX IF NOT EXISTS idx_areas_status ON areas(status);
```

### 5. INSERT ... ON CONFLICT DO NOTHING
```sql
INSERT INTO emission_factors (...) VALUES (...)
ON CONFLICT (id) DO NOTHING;
```

### 6. DROP VIEW IF EXISTS + CREATE OR REPLACE
```sql
DROP VIEW IF EXISTS available_areas;
CREATE OR REPLACE VIEW available_areas AS ...
```

## Migration 005 - Correções Aplicadas

### Problemas Corrigidos

1. **Duplicação de arquivo**: Havia dois arquivos `005_*`:
   - `005_create_areas_and_projects.sql` (removido)
   - `005_update_areas_schema.sql` (substituído)

2. **RENAME COLUMN não idempotente**:
   ```sql
   -- ANTES (erro se já renomeado):
   ALTER TABLE areas RENAME COLUMN producer_id TO owner_user_id;

   -- DEPOIS (idempotente):
   IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name='areas' AND column_name='producer_id') THEN
     ALTER TABLE areas RENAME COLUMN producer_id TO owner_user_id;
   END IF;
   ```

3. **ADD CONSTRAINT duplicado**:
   ```sql
   -- ANTES (erro se já existe):
   ALTER TABLE areas ADD CONSTRAINT check_status CHECK (...);

   -- DEPOIS (idempotente):
   ALTER TABLE areas DROP CONSTRAINT IF EXISTS check_status;
   ALTER TABLE areas ADD CONSTRAINT check_status CHECK (...);
   ```

4. **Faltava tabela area_criteria**:
   Agora criada com `CREATE TABLE IF NOT EXISTS`

### Estrutura Final da Migration 005

1. Cria tabela `areas` (se não existe)
2. Adiciona colunas novas (se não existem)
3. Renomeia colunas antigas (se existem)
4. Remove e recria todas as constraints (sempre limpo)
5. Cria indexes (IF NOT EXISTS)
6. Cria tabela `area_criteria` (se não existe)
7. Atualiza FK em `compensation_projection` (se tabela existe)
8. Remove e recria view `available_areas`
9. Migra dados antigos (com tratamento de erro)
10. Adiciona comentários

## Testado ✅

```bash
# Executado 1ª vez
bun run migrate
# Sucesso: migrations.applied 005_create_areas_schema.sql

# Executado 2ª vez (teste de idempotência)
# Executado SQL diretamente no banco
# Sucesso: Nenhum erro, mesmo executando 2x
```

## Arquivos Backup

Os arquivos antigos foram preservados:
- `005_create_areas_and_projects.sql.bak`
- `005_update_areas_schema.sql.bak`
- `006_seed_area_criteria_templates.sql.bak`

## Conformidade PostgreSQL ✅

Todas as migrações usam sintaxe padrão PostgreSQL:
- ✅ `IF NOT EXISTS` / `IF EXISTS`
- ✅ `DO $$ BEGIN ... END $$;` (blocos anônimos)
- ✅ `CREATE OR REPLACE VIEW`
- ✅ `ON CONFLICT DO NOTHING`
- ✅ `DROP ... IF EXISTS`
- ✅ `ALTER TABLE IF EXISTS`
- ✅ Consultas a `information_schema`

## Boas Práticas Implementadas

1. **Idempotência Total**: Todas podem ser executadas N vezes
2. **Ordem Sequencial**: Numeração clara (001, 002, ...)
3. **Comentários Detalhados**: Cada seção explicada
4. **Constraints com Nome**: Facilita DROP/ADD
5. **Tratamento de Erros**: `EXCEPTION WHEN OTHERS` em migrações de dados
6. **Verificação de Existência**: Antes de ADD COLUMN, RENAME, etc.
7. **Sem Hard Delete**: Sempre soft delete (deleted_at)

## Como Adicionar Nova Migration

1. Criar arquivo `00X_description.sql`
2. Usar `IF NOT EXISTS` em CREATE
3. Verificar existência antes de ALTER/RENAME
4. DROP IF EXISTS antes de ADD CONSTRAINT
5. Tratar erros em UPDATE/DELETE de dados
6. Documentar cada seção
7. Testar executando 2x

## Rollback

Migrações idempotentes não precisam de rollback explícito, pois:
- Não duplicam dados (ON CONFLICT)
- Não quebram se já executadas (IF EXISTS)
- Podem ser revertidas manualmente se necessário

Para reverter Migration 005 manualmente:
```sql
-- Remover tabelas
DROP TABLE IF EXISTS area_criteria CASCADE;
DROP TABLE IF EXISTS areas CASCADE;
DROP VIEW IF EXISTS available_areas;
```

Mas **não é recomendado** reverter em produção.
