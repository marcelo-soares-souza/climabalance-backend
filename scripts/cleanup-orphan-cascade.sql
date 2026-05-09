-- Limpa registros orfaos de usuarios que foram soft-deletados
-- sem que a cascadeSoftDelete() tenha rodado corretamente.
--
-- Uso: psql -U postgres -h localhost climabalance -f scripts/cleanup-orphan-cascade.sql

BEGIN;

CREATE TEMP TABLE deleted_users AS
  SELECT id FROM users WHERE deleted_at IS NOT NULL;

UPDATE user_profiles             SET deleted_at = NOW(), updated_at = NOW() WHERE user_id IN (SELECT id FROM deleted_users) AND deleted_at IS NULL;
UPDATE user_roles                SET deleted_at = NOW(), updated_at = NOW() WHERE user_id IN (SELECT id FROM deleted_users) AND deleted_at IS NULL;
UPDATE email_confirmations       SET deleted_at = NOW(), updated_at = NOW() WHERE user_id IN (SELECT id FROM deleted_users) AND deleted_at IS NULL;
UPDATE password_reset_tokens     SET deleted_at = NOW(), updated_at = NOW() WHERE user_id IN (SELECT id FROM deleted_users) AND deleted_at IS NULL;
UPDATE refresh_tokens            SET deleted_at = NOW(), updated_at = NOW(), revoked_at = NOW() WHERE user_id IN (SELECT id FROM deleted_users) AND deleted_at IS NULL;
UPDATE footprint_calculations    SET deleted_at = NOW(), updated_at = NOW() WHERE user_id IN (SELECT id FROM deleted_users) AND deleted_at IS NULL;
UPDATE area_media                SET deleted_at = NOW(), updated_at = NOW() WHERE uploaded_by_user_id IN (SELECT id FROM deleted_users) AND deleted_at IS NULL;
UPDATE tree_plantings            SET deleted_at = NOW(), updated_at = NOW() WHERE planted_by_user_id IN (SELECT id FROM deleted_users) AND deleted_at IS NULL;
UPDATE compensations             SET deleted_at = NOW(), updated_at = NOW() WHERE supporter_user_id IN (SELECT id FROM deleted_users) AND deleted_at IS NULL;

UPDATE areas                     SET deleted_at = NOW(), updated_at = NOW() WHERE owner_user_id IN (SELECT id FROM deleted_users) AND deleted_at IS NULL;

UPDATE tree_plantings            SET deleted_at = NOW(), updated_at = NOW() WHERE area_id IN (SELECT id FROM areas WHERE owner_user_id IN (SELECT id FROM deleted_users) AND deleted_at IS NOT NULL) AND deleted_at IS NULL;
UPDATE area_media                SET deleted_at = NOW(), updated_at = NOW() WHERE area_id IN (SELECT id FROM areas WHERE owner_user_id IN (SELECT id FROM deleted_users) AND deleted_at IS NOT NULL) AND deleted_at IS NULL;
UPDATE area_criteria             SET deleted_at = NOW(), updated_at = NOW() WHERE area_id IN (SELECT id FROM areas WHERE owner_user_id IN (SELECT id FROM deleted_users) AND deleted_at IS NOT NULL) AND deleted_at IS NULL;
UPDATE compensations             SET deleted_at = NOW(), updated_at = NOW() WHERE area_id IN (SELECT id FROM areas WHERE owner_user_id IN (SELECT id FROM deleted_users) AND deleted_at IS NOT NULL) AND deleted_at IS NULL;

DROP TABLE deleted_users;

COMMIT;

SELECT 'user_profiles' AS tabela, COUNT(*) AS registros_afetados FROM user_profiles WHERE deleted_at IS NOT NULL
UNION ALL
SELECT 'areas (owner)', COUNT(*) FROM areas WHERE deleted_at IS NOT NULL
UNION ALL
SELECT 'usuarios deletados', COUNT(*) FROM users WHERE deleted_at IS NOT NULL;
