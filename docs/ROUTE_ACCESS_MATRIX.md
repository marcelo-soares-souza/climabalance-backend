# Route Access Matrix

Fonte verdade: `backend/src/infrastructure/http/routes.ts`.

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | /api/v1/openapi.json | docs | `ENABLE_API_DOCS=true`; fora de local usar `API_DOCS_AUTH_MODE=admin|basic`. |
| GET | /api/v1/docs | docs | `ENABLE_API_DOCS=true`; fora de local usar `API_DOCS_AUTH_MODE=admin|basic`. |
| GET | /api/v1/auth/session | authenticated | Bootstrap de sessao com bearer token. |
| GET | /api/v1/auth/human-check | public | Publico. |
| POST | /api/v1/auth/register | public | Publico. |
| POST | /api/v1/auth/login | public | Publico. |
| POST | /api/v1/auth/confirm-email | public | Publico. |
| POST | /api/v1/auth/confirm-email/resend | public | Publico. |
| POST | /api/v1/auth/password-reset/request | public | Publico. |
| POST | /api/v1/auth/password-reset/confirm | public | Publico. |
| POST | /api/v1/users/change-password | authenticated | Bearer token; sujeito a rate limit por usuario. |
| POST | /api/v1/auth/refresh | session_cookie | Cookie refresh + CSRF. |
| POST | /api/v1/auth/revoke | session_cookie | Cookie refresh + CSRF. |
| GET | /api/v1/auth/sessions | authenticated | Bearer token. |
| DELETE | /api/v1/auth/sessions/:id | authenticated | Bearer token. |
| DELETE | /api/v1/auth/sessions | authenticated | Bearer token. |
| GET | /api/v1/users | administrator | Somente admin. |
| GET | /api/v1/directory/users | public | Diretorio publico. |
| GET | /api/v1/users/:id | public | Publico; auth opcional para enriquecimento. |
| GET | /api/v1/users/:id/profile | public | Publico com PII sensivel mascarada. |
| GET | /api/v1/users/:id/climate-balance | public | Publico. |
| GET | /api/v1/users/:id/contributions | public | Publico. |
| GET | /api/v1/users/:id/compensations | public | Publico. |
| GET | /api/v1/users/:id/certificates | public | Publico. |
| GET | /api/v1/users/:id/sessions | authenticated | Handler valida self/admin. |
| DELETE | /api/v1/users/:id/sessions/:sessionId | authenticated | Handler valida self/admin. |
| DELETE | /api/v1/users/:id/sessions | authenticated | Handler valida self/admin. |
| PATCH | /api/v1/users/:id | self_or_administrator | `withAuthOrSelf`. |
| DELETE | /api/v1/users/:id | self_or_administrator | `withAuthOrSelf`. |
| PUT | /api/v1/users/:id/profile | self_or_administrator | `withAuthOrSelf`. |
| POST | /api/v1/users/:id/profile/avatar | self_or_administrator | `withAuthOrSelf`. |
| GET | /api/v1/users/:id/profile/avatar/file | public | Publico; auth opcional. |
| GET | /api/v1/users/:id/data-export | self_or_administrator | `withAuthOrSelf`. |
| POST | /api/v1/privacy/subject-request | authenticated | Bearer token. |
| GET | /api/v1/privacy/subject-requests | authenticated | Bearer token. |
| POST | /api/v1/privacy/cookie-consent | authenticated | Bearer token. |
| GET | /api/v1/locations/states | public | Publico. |
| GET | /api/v1/locations/cities | public | Publico. |
| GET | /api/v1/audit-log | administrator | Somente admin. |
| POST | /api/v1/audit-log/verify | administrator | Somente admin. |
| GET | /api/v1/audit-log/export | administrator | Somente admin. |
| POST | /api/v1/footprint/calculations | authenticated | Bearer token. |
| PATCH | /api/v1/footprint/calculations/:id | authenticated | Bearer token. |
| POST | /api/v1/footprint/calculations/:id/finalize | authenticated | Bearer token. |
| GET | /api/v1/footprint/calculations/:id | authenticated | Bearer token. |
| GET | /api/v1/footprint/calculations | authenticated | Bearer token. |
| DELETE | /api/v1/footprint/calculations/:id | authenticated | Bearer token. |
| GET | /api/v1/footprint/emission-factors | public | Publico. |
| POST | /api/v1/footprint/calculate-guest | public | Publico. |
| POST | /api/v1/footprint/calculations/:id/projection | authenticated | Bearer token. |
| POST | /api/v1/areas | producer_or_administrator | Criacao de area. |
| GET | /api/v1/areas/:id | public | Publico; auth opcional. |
| GET | /api/v1/areas/:id/contributions | public | Publico; auth opcional. |
| PATCH | /api/v1/areas/:id | authenticated | Handler valida owner/admin por estado da area. |
| DELETE | /api/v1/areas/:id | authenticated | Handler valida owner/admin. |
| GET | /api/v1/areas | public | Publico; auth opcional. |
| POST | /api/v1/areas/:id/submit-audit | authenticated | Bearer token; fluxo validado no handler. |
| POST | /api/v1/areas/:id/approve | analyst_or_administrator | Aprovar auditoria. |
| POST | /api/v1/areas/:id/reject | analyst_or_administrator | Rejeitar auditoria. |
| POST | /api/v1/areas/:id/activate | analyst_or_administrator | Ativar area auditada. |
| POST | /api/v1/areas/:id/suspend | administrator | Suspensao apenas admin. |
| GET | /api/v1/areas/:id/capacity | authenticated | Bearer token. |
| POST | /api/v1/areas/:id/media | producer_or_administrator | Upload de midia. |
| GET | /api/v1/areas/:id/media | public | Publico; auth opcional. |
| GET | /api/v1/areas/media/:id/file | public | Midia publica. |
| GET | /api/v1/areas/media/:id/thumbnail | public | Midia publica. |
| DELETE | /api/v1/areas/media/:id | producer_or_administrator | Exclusao de midia. |
| GET | /api/v1/map/areas | public | Publico. |
| GET | /api/v1/areas/:id/planted-trees | public | Publico. |
| GET | /api/v1/areas/:id/pending-tree-count | public | Publico. |
| POST | /api/v1/areas/:id/planted-trees | producer_or_administrator | Registro de plantio. |
| DELETE | /api/v1/areas/:id/planted-trees | producer_or_administrator | Remocao de plantio. |
| POST | /api/v1/areas/:id/satellite-image | producer_or_administrator | Busca/gera imagem satelital. |
| GET | /api/v1/areas/:id/satellite-image/latest | public | Publico; auth opcional. |
| GET | /api/v1/satellite-images/:imageId/file | public | Midia publica. |
| GET | /api/v1/satellite-images/:imageId/thumbnail | public | Midia publica. |
| GET | /api/v1/updates/version | public | Publico. |
| GET | /api/v1/updates/stream | public | Publico. |
| POST | /api/v1/updates/notify | administrator | Somente admin. |
| POST | /api/v1/contributions | authenticated | Bearer token; rate limit por usuario. |
| POST | /api/v1/contributions/quote | authenticated | Bearer token; rate limit por usuario. |
| GET | /api/v1/contributions | authenticated | Bearer token. |
| POST | /api/v1/compensations | authenticated | Bearer token; rate limit por usuario. |
| POST | /api/v1/compensations/quote | authenticated | Bearer token; rate limit por usuario. |
| GET | /api/v1/compensations | authenticated | Bearer token. |
| GET | /api/v1/certificates/validate | public | Publico. |
| GET | /api/v1/certificates/:id/download | authenticated | Bearer token. |
| POST | /api/v1/payments/simulate | authenticated | Apenas local/test; nao sobe em producao. |
| POST | /api/v1/payments/create-payment-intent | individual_or_legal_entity_or_administrator | Checkout Stripe. |
| GET | /api/v1/stats/global | public | Publico. |
| GET | /api/v1/payments/:id/status | authenticated | Bearer token. |
| POST | /api/v1/payments/webhook | public | Webhook assinado pelo provedor. |
| POST | /api/v1/payments/reconcile | administrator | Conciliacao manual admin. |
| POST | /api/v1/producers/stripe/onboard | producer_or_administrator | Onboarding Stripe Connect. |
| GET | /api/v1/producers/stripe/status | producer_or_administrator | Status Stripe Connect. |
| POST | /api/v1/producers/stripe/dashboard | producer_or_administrator | Acesso dashboard Stripe Connect. |
| POST | /api/v1/contact | authenticated | Bearer token. |
