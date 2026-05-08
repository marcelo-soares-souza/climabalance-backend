import type { HttpContext } from '../../shared/http/router';
import { getRequestOrigin } from '../../shared/http/request';
import { jsonResponse } from '../../shared/http/response';

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

type QueryParameter = {
  name: string;
  description: string;
  required?: boolean;
  schema: Record<string, unknown>;
};

type ApiRouteDoc = {
  method: HttpMethod;
  path: string;
  summary: string;
  description: string;
  tags: string[];
  secured?: boolean;
  requestBodyRef?: string;
  queryParameters?: QueryParameter[];
  successStatus: '200' | '201' | '202' | '204';
  successResponse:
    | 'OkData'
    | 'OkList'
    | 'CreatedData'
    | 'AcceptedData'
    | 'NoContent'
    | 'BinaryFileResponse'
    | 'EventStreamResponse'
    | 'HtmlDocumentResponse';
  includeNotFound?: boolean;
};

const stringSchema = { type: 'string' } as const;
const uuidLikeSchema = {
  type: 'string',
  description: 'UUIDv7 stored as VARCHAR',
  minLength: 1,
  maxLength: 64,
};

const commonListQuery: QueryParameter[] = [
  {
    name: 'limit',
    description: 'Max records to return',
    schema: { type: 'integer', minimum: 1, maximum: 500 },
  },
  {
    name: 'offset',
    description: 'Records offset',
    schema: { type: 'integer', minimum: 0 },
  },
];

const routes: ApiRouteDoc[] = [
  {
    method: 'get',
    path: '/api/v1/openapi.json',
    summary: 'Get OpenAPI document',
    description: 'Returns OpenAPI 3.0 JSON for all active API routes.',
    tags: ['Docs'],
    successStatus: '200',
    successResponse: 'OkData',
  },
  {
    method: 'get',
    path: '/api/v1/docs',
    summary: 'Open Swagger UI',
    description: 'Serves Swagger UI configured for Bearer authentication.',
    tags: ['Docs'],
    successStatus: '200',
    successResponse: 'HtmlDocumentResponse',
  },

  {
    method: 'get',
    path: '/api/v1/auth/human-check',
    summary: 'Human check challenge',
    description: 'Returns a lightweight challenge payload for anti-automation checks.',
    tags: ['Auth'],
    successStatus: '200',
    successResponse: 'OkData',
  },
  {
    method: 'post',
    path: '/api/v1/auth/register',
    summary: 'Register user',
    description: 'Creates a new user and sends confirmation token.',
    tags: ['Auth'],
    requestBodyRef: 'AuthRegisterRequest',
    successStatus: '201',
    successResponse: 'CreatedData',
  },
  {
    method: 'post',
    path: '/api/v1/auth/login',
    summary: 'Login',
    description: 'Authenticates user and returns access/refresh token payload.',
    tags: ['Auth'],
    requestBodyRef: 'AuthLoginRequest',
    successStatus: '200',
    successResponse: 'OkData',
  },
  {
    method: 'post',
    path: '/api/v1/auth/confirm-email',
    summary: 'Confirm email',
    description: 'Confirms user email using token.',
    tags: ['Auth'],
    requestBodyRef: 'AuthConfirmEmailRequest',
    successStatus: '200',
    successResponse: 'OkData',
  },
  {
    method: 'post',
    path: '/api/v1/auth/confirm-email/resend',
    summary: 'Resend confirmation email',
    description: 'Resends confirmation email token.',
    tags: ['Auth'],
    requestBodyRef: 'AuthResendConfirmationRequest',
    successStatus: '200',
    successResponse: 'OkData',
  },
  {
    method: 'post',
    path: '/api/v1/auth/password-reset/request',
    summary: 'Request password reset',
    description: 'Starts password reset flow for a user email.',
    tags: ['Auth'],
    requestBodyRef: 'AuthPasswordResetRequest',
    successStatus: '200',
    successResponse: 'OkData',
  },
  {
    method: 'post',
    path: '/api/v1/auth/password-reset/confirm',
    summary: 'Confirm password reset',
    description: 'Resets password using password reset token.',
    tags: ['Auth'],
    requestBodyRef: 'AuthPasswordResetConfirmRequest',
    successStatus: '200',
    successResponse: 'OkData',
  },
  {
    method: 'post',
    path: '/api/v1/users/change-password',
    summary: 'Change password',
    description: 'Changes the authenticated user password by verifying old password.',
    tags: ['Users'],
    secured: true,
    requestBodyRef: 'AuthChangePasswordRequest',
    successStatus: '200',
    successResponse: 'OkData',
  },
  {
    method: 'post',
    path: '/api/v1/auth/refresh',
    summary: 'Refresh access token',
    description: 'Creates new access token from refresh token.',
    tags: ['Auth'],
    requestBodyRef: 'AuthRefreshRequest',
    successStatus: '200',
    successResponse: 'OkData',
  },
  {
    method: 'post',
    path: '/api/v1/auth/revoke',
    summary: 'Revoke refresh token',
    description: 'Revokes an active refresh token.',
    tags: ['Auth'],
    secured: true,
    requestBodyRef: 'AuthRevokeRequest',
    successStatus: '200',
    successResponse: 'OkData',
  },
  {
    method: 'get',
    path: '/api/v1/auth/sessions',
    summary: 'List active sessions',
    description: 'Lists active sessions (refresh tokens) for the authenticated user.',
    tags: ['Auth'],
    secured: true,
    successStatus: '200',
    successResponse: 'OkList',
  },
  {
    method: 'delete',
    path: '/api/v1/auth/sessions/:id',
    summary: 'Revoke a session',
    description: 'Revokes a specific session (refresh token).',
    tags: ['Auth'],
    secured: true,
    successStatus: '200',
    successResponse: 'OkData',
  },
  {
    method: 'delete',
    path: '/api/v1/auth/sessions',
    summary: 'Revoke all sessions',
    description: 'Revokes all active sessions for the authenticated user (logout everywhere).',
    tags: ['Auth'],
    secured: true,
    successStatus: '200',
    successResponse: 'OkData',
  },

  {
    method: 'get',
    path: '/api/v1/users',
    summary: 'List users',
    description: 'Lists users (administrator only).',
    tags: ['Users'],
    secured: true,
    queryParameters: [...commonListQuery],
    successStatus: '200',
    successResponse: 'OkList',
  },
  {
    method: 'get',
    path: '/api/v1/directory/users',
    summary: 'List public user directory',
    description: 'Public listing of users with profile, area count, and tree count.',
    tags: ['Users'],
    queryParameters: [
      { name: 'limit', schema: { type: 'string' }, required: false, description: 'Max items' },
      { name: 'offset', schema: { type: 'string' }, required: false, description: 'Pagination offset' },
    ],
    successStatus: '200',
    successResponse: 'OkList',
  },
  {
    method: 'get',
    path: '/api/v1/users/:id',
    summary: 'Get user',
    description: 'Returns user by id (self or administrator).',
    tags: ['Users'],
    secured: true,
    successStatus: '200',
    successResponse: 'OkData',
    includeNotFound: true,
  },
  {
    method: 'get',
    path: '/api/v1/users/:id/profile',
    summary: 'Get user profile',
    description: 'Returns normalized profile fields for user.',
    tags: ['Users'],
    secured: true,
    successStatus: '200',
    successResponse: 'OkData',
    includeNotFound: true,
  },
  {
    method: 'get',
    path: '/api/v1/users/:id/climate-balance',
    summary: 'Get user climate balance',
    description:
      'Returns gross emissions, estimated paid tree-purchase offset, and net tracked balance for user.',
    tags: ['Users'],
    secured: true,
    successStatus: '200',
    successResponse: 'OkData',
    includeNotFound: true,
  },
  {
    method: 'get',
    path: '/api/v1/users/:id/contributions',
    summary: 'List user contributions',
    description: 'Lists tree-planting contribution history by user id (self/admin).',
    tags: ['Contributions'],
    secured: true,
    queryParameters: [
      {
        name: 'status',
        description: 'Contribution status filter',
        schema: {
          type: 'string',
          enum: ['pending', 'paid', 'canceled', 'refunded'],
        },
      },
      ...commonListQuery,
    ],
    successStatus: '200',
    successResponse: 'OkList',
  },
  {
    method: 'get',
    path: '/api/v1/users/:id/compensations',
    summary: 'List user compensations',
    description: 'Lists compensation history by user id (self/admin).',
    tags: ['Compensations'],
    secured: true,
    queryParameters: [
      {
        name: 'status',
        description: 'Compensation status filter',
        schema: {
          type: 'string',
          enum: ['pending', 'paid', 'canceled', 'refunded'],
        },
      },
      ...commonListQuery,
    ],
    successStatus: '200',
    successResponse: 'OkList',
  },
  {
    method: 'get',
    path: '/api/v1/users/:id/certificates',
    summary: 'List user certificates',
    description: 'Lists certificates by user id (self/admin).',
    tags: ['Certificates'],
    secured: true,
    queryParameters: [
      {
        name: 'status',
        description: 'Certificate status filter',
        schema: { type: 'string', enum: ['issued', 'revoked'] },
      },
      ...commonListQuery,
    ],
    successStatus: '200',
    successResponse: 'OkList',
  },
  {
    method: 'patch',
    path: '/api/v1/users/:id',
    summary: 'Update user',
    description: 'Updates base user fields (self/admin).',
    tags: ['Users'],
    secured: true,
    requestBodyRef: 'UserUpdateRequest',
    successStatus: '200',
    successResponse: 'OkData',
    includeNotFound: true,
  },
  {
    method: 'delete',
    path: '/api/v1/users/:id',
    summary: 'Delete user',
    description: 'Soft-deletes user (self/admin).',
    tags: ['Users'],
    secured: true,
    successStatus: '200',
    successResponse: 'OkData',
    includeNotFound: true,
  },
  {
    method: 'put',
    path: '/api/v1/users/:id/profile',
    summary: 'Create or update profile',
    description: 'Creates or updates profile fields (self/admin).',
    tags: ['Users'],
    secured: true,
    requestBodyRef: 'UserProfileUpsertRequest',
    successStatus: '200',
    successResponse: 'OkData',
  },

  {
    method: 'get',
    path: '/api/v1/audit-log',
    summary: 'List audit log',
    description: 'Lists audit entries (administrator only).',
    tags: ['Audit'],
    secured: true,
    queryParameters: [
      {
        name: 'actor_user_id',
        description: 'Filter by actor id (exact UUID)',
        schema: uuidLikeSchema,
      },
      {
        name: 'actor_email',
        description: 'Filter by actor email (partial match)',
        schema: stringSchema,
      },
      {
        name: 'action',
        description: 'Filter by action name (partial match)',
        schema: stringSchema,
      },
      {
        name: 'client_ip',
        description: 'Filter by client IP (partial match)',
        schema: stringSchema,
      },
      {
        name: 'entity_type',
        description: 'Filter by entity type',
        schema: stringSchema,
      },
      {
        name: 'entity_id',
        description: 'Filter by entity id',
        schema: stringSchema,
      },
      ...commonListQuery,
    ],
    successStatus: '200',
    successResponse: 'OkList',
  },

  {
    method: 'post',
    path: '/api/v1/footprint/calculations',
    summary: 'Create footprint calculation',
    description: 'Creates a draft footprint calculation with inputs.',
    tags: ['Footprint'],
    secured: true,
    requestBodyRef: 'FootprintCreateCalculationRequest',
    successStatus: '201',
    successResponse: 'CreatedData',
  },
  {
    method: 'patch',
    path: '/api/v1/footprint/calculations/:id',
    summary: 'Update footprint calculation',
    description: 'Updates a draft calculation.',
    tags: ['Footprint'],
    secured: true,
    requestBodyRef: 'FootprintUpdateCalculationRequest',
    successStatus: '200',
    successResponse: 'OkData',
    includeNotFound: true,
  },
  {
    method: 'post',
    path: '/api/v1/footprint/calculations/:id/finalize',
    summary: 'Finalize footprint calculation',
    description: 'Finalizes a calculation and makes it immutable.',
    tags: ['Footprint'],
    secured: true,
    successStatus: '200',
    successResponse: 'OkData',
    includeNotFound: true,
  },
  {
    method: 'get',
    path: '/api/v1/footprint/calculations/:id',
    summary: 'Get footprint calculation',
    description: 'Returns calculation details with inputs and breakdown.',
    tags: ['Footprint'],
    secured: true,
    successStatus: '200',
    successResponse: 'OkData',
    includeNotFound: true,
  },
  {
    method: 'get',
    path: '/api/v1/footprint/calculations',
    summary: 'List footprint calculations',
    description: 'Lists calculations for current user; admin can filter by email.',
    tags: ['Footprint'],
    secured: true,
    queryParameters: [
      {
        name: 'status',
        description: 'Filter by calculation status',
        schema: { type: 'string', enum: ['draft', 'finalized'] },
      },
      {
        name: 'profile_type',
        description: 'Profile type filter',
        schema: { type: 'string', enum: ['individual', 'legal_entity'] },
      },
      {
        name: 'user_email',
        description: 'Admin-only email filter',
        schema: { type: 'string', format: 'email' },
      },
      ...commonListQuery,
    ],
    successStatus: '200',
    successResponse: 'OkList',
  },
  {
    method: 'delete',
    path: '/api/v1/footprint/calculations/:id',
    summary: 'Delete footprint calculation',
    description: 'Soft-deletes a draft calculation.',
    tags: ['Footprint'],
    secured: true,
    successStatus: '200',
    successResponse: 'OkData',
    includeNotFound: true,
  },
  {
    method: 'get',
    path: '/api/v1/footprint/emission-factors',
    summary: 'List emission factors',
    description: 'Returns emission factors with optional filters.',
    tags: ['Footprint'],
    queryParameters: [
      { name: 'version', description: 'Version filter', schema: stringSchema },
      { name: 'region', description: 'Region filter', schema: stringSchema },
      { name: 'category', description: 'Category filter', schema: stringSchema },
    ],
    successStatus: '200',
    successResponse: 'OkList',
  },
  {
    method: 'post',
    path: '/api/v1/footprint/calculate-guest',
    summary: 'Calculate guest footprint',
    description: 'Calculates carbon footprint for anonymous users without creating a calculation record.',
    tags: ['Footprint'],
    requestBodyRef: 'FootprintCalculateGuestRequest',
    successStatus: '200',
    successResponse: 'OkData',
  },
  {
    method: 'post',
    path: '/api/v1/footprint/calculations/:id/projection',
    summary: 'Create compensation projection',
    description: 'Creates compensation projection for a finalized calculation.',
    tags: ['Footprint'],
    secured: true,
    requestBodyRef: 'FootprintCreateProjectionRequest',
    successStatus: '200',
    successResponse: 'OkData',
    includeNotFound: true,
  },

  {
    method: 'post',
    path: '/api/v1/areas',
    summary: 'Create area',
    description: 'Creates a new area in draft status.',
    tags: ['Areas'],
    secured: true,
    requestBodyRef: 'AreaCreateRequest',
    successStatus: '201',
    successResponse: 'CreatedData',
  },
  {
    method: 'get',
    path: '/api/v1/areas/:id',
    summary: 'Get area detail',
    description: 'Returns area detail. Optional auth for public active areas.',
    tags: ['Areas'],
    successStatus: '200',
    successResponse: 'OkData',
    includeNotFound: true,
  },
  {
    method: 'get',
    path: '/api/v1/areas/:id/contributions',
    summary: 'List area contributions',
    description:
      'Lists paid tree purchase contributions for a given area without financial values.',
    tags: ['Compensations'],
    queryParameters: [...commonListQuery],
    successStatus: '200',
    successResponse: 'OkList',
  },
  {
    method: 'patch',
    path: '/api/v1/areas/:id',
    summary: 'Update area',
    description: 'Updates area while respecting role/status rules.',
    tags: ['Areas'],
    secured: true,
    requestBodyRef: 'AreaUpdateRequest',
    successStatus: '200',
    successResponse: 'OkData',
    includeNotFound: true,
  },
  {
    method: 'delete',
    path: '/api/v1/areas/:id',
    summary: 'Delete area',
    description: 'Soft-deletes area according to permissions.',
    tags: ['Areas'],
    secured: true,
    successStatus: '200',
    successResponse: 'OkData',
    includeNotFound: true,
  },
  {
    method: 'get',
    path: '/api/v1/areas',
    summary: 'List areas',
    description: 'Lists areas with role-aware filters.',
    tags: ['Areas'],
    secured: true,
    queryParameters: [
      {
        name: 'status',
        description: 'Area status filter',
        schema: {
          type: 'string',
          enum: [
            'draft',
            'pending_audit',
            'approved',
            'active',
            'rejected',
            'suspended',
          ],
        },
      },
      { name: 'ownerUserId', description: 'Owner id filter', schema: uuidLikeSchema },
      {
        name: 'biome',
        description: 'Biome filter',
        schema: {
          type: 'string',
          enum: ['cerrado', 'amazonia', 'mata_atlantica', 'caatinga', 'pampa', 'pantanal'],
        },
      },
      {
        name: 'onlyActive',
        description: 'Filter only active areas',
        schema: { type: 'boolean' },
      },
      ...commonListQuery,
    ],
    successStatus: '200',
    successResponse: 'OkList',
  },
  {
    method: 'post',
    path: '/api/v1/areas/:id/submit-audit',
    summary: 'Submit area for audit',
    description: 'Moves area to pending_audit status.',
    tags: ['Areas'],
    secured: true,
    successStatus: '200',
    successResponse: 'OkData',
    includeNotFound: true,
  },
  {
    method: 'post',
    path: '/api/v1/areas/:id/approve',
    summary: 'Approve area',
    description: 'Approves area based on submitted criteria.',
    tags: ['Areas'],
    secured: true,
    requestBodyRef: 'AreaApproveRequest',
    successStatus: '200',
    successResponse: 'OkData',
    includeNotFound: true,
  },
  {
    method: 'post',
    path: '/api/v1/areas/:id/reject',
    summary: 'Reject area',
    description: 'Rejects area and stores reason.',
    tags: ['Areas'],
    secured: true,
    requestBodyRef: 'AreaRejectRequest',
    successStatus: '200',
    successResponse: 'OkData',
    includeNotFound: true,
  },
  {
    method: 'post',
    path: '/api/v1/areas/:id/activate',
    summary: 'Activate area',
    description: 'Activates approved area.',
    tags: ['Areas'],
    secured: true,
    successStatus: '200',
    successResponse: 'OkData',
    includeNotFound: true,
  },
  {
    method: 'post',
    path: '/api/v1/areas/:id/suspend',
    summary: 'Suspend area',
    description: 'Suspends active area.',
    tags: ['Areas'],
    secured: true,
    successStatus: '200',
    successResponse: 'OkData',
    includeNotFound: true,
  },
  {
    method: 'get',
    path: '/api/v1/areas/:id/capacity',
    summary: 'Get area capacity',
    description: 'Returns current available and committed carbon capacity.',
    tags: ['Areas'],
    secured: true,
    successStatus: '200',
    successResponse: 'OkData',
    includeNotFound: true,
  },
  {
    method: 'post',
    path: '/api/v1/areas/:id/media',
    summary: 'Upload area media',
    description: 'Uploads photo/video as base64 payload.',
    tags: ['Area Media'],
    secured: true,
    requestBodyRef: 'AreaUploadMediaRequest',
    successStatus: '201',
    successResponse: 'CreatedData',
    includeNotFound: true,
  },
  {
    method: 'get',
    path: '/api/v1/areas/:id/media',
    summary: 'List area media',
    description: 'Lists area photos/videos.',
    tags: ['Area Media'],
    queryParameters: [...commonListQuery],
    successStatus: '200',
    successResponse: 'OkList',
    includeNotFound: true,
  },
  {
    method: 'get',
    path: '/api/v1/areas/media/:id/file',
    summary: 'Get media file',
    description: 'Returns uploaded area media binary payload.',
    tags: ['Area Media'],
    successStatus: '200',
    successResponse: 'BinaryFileResponse',
    includeNotFound: true,
  },
  {
    method: 'get',
    path: '/api/v1/areas/media/:id/thumbnail',
    summary: 'Get media thumbnail',
    description: 'Returns a 200x200 WebP thumbnail for map display. Generated lazily on first request.',
    tags: ['Area Media'],
    successStatus: '200',
    successResponse: 'BinaryFileResponse',
    includeNotFound: true,
  },
  {
    method: 'delete',
    path: '/api/v1/areas/media/:id',
    summary: 'Delete area media',
    description: 'Deletes media record and binary file.',
    tags: ['Area Media'],
    secured: true,
    successStatus: '200',
    successResponse: 'OkData',
    includeNotFound: true,
  },

  {
    method: 'get',
    path: '/api/v1/map/areas',
    summary: 'List map areas',
    description: 'Public endpoint with active areas for map rendering.',
    tags: ['Map'],
    queryParameters: [
      {
        name: 'biome',
        description: 'Biome filter',
        schema: {
          type: 'string',
          enum: ['cerrado', 'amazonia', 'mata_atlantica', 'caatinga', 'pampa', 'pantanal'],
        },
      },
    ],
    successStatus: '200',
    successResponse: 'OkList',
  },

  {
    method: 'get',
    path: '/api/v1/areas/:id/planted-trees',
    summary: 'List planted trees',
    description: 'Returns all planted tree points for an area.',
    tags: ['Area Planted Trees'],
    successStatus: '200',
    successResponse: 'OkList',
  },
  {
    method: 'get',
    path: '/api/v1/areas/:id/pending-tree-count',
    summary: 'Get pending tree planting count',
    description: 'Returns the count of trees pending planting for an area.',
    tags: ['Area Planted Trees'],
    secured: true,
    successStatus: '200',
    successResponse: 'OkData',
  },
  {
    method: 'post',
    path: '/api/v1/areas/:id/planted-trees',
    summary: 'Save planted trees',
    description: 'Saves a batch of planted tree points for an area.',
    tags: ['Area Planted Trees'],
    secured: true,
    successStatus: '201',
    successResponse: 'OkData',
  },
  {
    method: 'delete',
    path: '/api/v1/areas/:id/planted-trees',
    summary: 'Delete planted trees',
    description: 'Deletes all planted tree points for an area.',
    tags: ['Area Planted Trees'],
    secured: true,
    successStatus: '200',
    successResponse: 'OkData',
  },

  {
    method: 'post',
    path: '/api/v1/areas/:id/satellite-image',
    summary: 'Fetch satellite image',
    description: 'Fetches a new satellite image for the area from Sentinel-2 or Landsat.',
    tags: ['Satellite Image'],
    secured: true,
    successStatus: '201',
    successResponse: 'OkData',
  },
  {
    method: 'get',
    path: '/api/v1/areas/:id/satellite-image/latest',
    summary: 'Get latest satellite image',
    description: 'Returns the latest satellite image for an area.',
    tags: ['Satellite Image'],
    successStatus: '200',
    successResponse: 'OkData',
  },
  {
    method: 'get',
    path: '/api/v1/satellite-images/:imageId/file',
    summary: 'Download satellite image file',
    description: 'Returns the satellite image binary file.',
    tags: ['Satellite Image'],
    successStatus: '200',
    successResponse: 'BinaryFileResponse',
  },
  {
    method: 'get',
    path: '/api/v1/satellite-images/:imageId/thumbnail',
    summary: 'Download satellite image thumbnail',
    description: 'Returns the satellite image thumbnail.',
    tags: ['Satellite Image'],
    successStatus: '200',
    successResponse: 'BinaryFileResponse',
  },

  {
    method: 'get',
    path: '/api/v1/updates/version',
    summary: 'Get build version',
    description: 'Returns backend build version and timestamp.',
    tags: ['Updates'],
    successStatus: '200',
    successResponse: 'OkData',
  },
  {
    method: 'get',
    path: '/api/v1/updates/stream',
    summary: 'Subscribe update stream',
    description: 'SSE stream for real-time version update notifications.',
    tags: ['Updates'],
    successStatus: '200',
    successResponse: 'EventStreamResponse',
  },
  {
    method: 'post',
    path: '/api/v1/updates/notify',
    summary: 'Notify update',
    description: 'Broadcasts version update to connected SSE clients.',
    tags: ['Updates'],
    secured: true,
    requestBodyRef: 'UpdateNotifyRequest',
    successStatus: '200',
    successResponse: 'OkData',
  },

  {
    method: 'post',
    path: '/api/v1/contributions',
    summary: 'Create contribution',
    description:
      'Creates a pending tree-planting contribution using project price and impact snapshots.',
    tags: ['Contributions'],
    secured: true,
    requestBodyRef: 'CreateCompensationRequest',
    successStatus: '201',
    successResponse: 'CreatedData',
  },
  {
    method: 'post',
    path: '/api/v1/contributions/quote',
    summary: 'Quote contribution',
    description: 'Calculates values for a tree-planting contribution quote.',
    tags: ['Contributions'],
    secured: true,
    requestBodyRef: 'QuoteTreePurchaseRequest',
    successStatus: '200',
    successResponse: 'OkData',
  },
  {
    method: 'get',
    path: '/api/v1/contributions',
    summary: 'List own contributions',
    description: 'Lists contribution history for current user.',
    tags: ['Contributions'],
    secured: true,
    queryParameters: [
      {
        name: 'status',
        description: 'Contribution status filter',
        schema: {
          type: 'string',
          enum: ['pending', 'paid', 'canceled', 'refunded'],
        },
      },
      ...commonListQuery,
    ],
    successStatus: '200',
    successResponse: 'OkList',
  },
  {
    method: 'post',
    path: '/api/v1/compensations',
    summary: 'Create compensation',
    description:
      'Legacy alias for tree-planting contribution creation using project price and impact snapshots.',
    tags: ['Compensations'],
    secured: true,
    requestBodyRef: 'CompensationCreateRequest',
    successStatus: '201',
    successResponse: 'CreatedData',
  },
  {
    method: 'post',
    path: '/api/v1/compensations/quote',
    summary: 'Quote tree purchase compensation',
    description: 'Calculates values for a tree-planting contribution quote.',
    tags: ['Compensations'],
    secured: true,
    requestBodyRef: 'CompensationQuoteRequest',
    successStatus: '200',
    successResponse: 'OkData',
  },
  {
    method: 'get',
    path: '/api/v1/compensations',
    summary: 'List own compensations',
    description: 'Lists compensation history for current user.',
    tags: ['Compensations'],
    secured: true,
    queryParameters: [
      {
        name: 'status',
        description: 'Compensation status filter',
        schema: {
          type: 'string',
          enum: ['pending', 'paid', 'canceled', 'refunded'],
        },
      },
      ...commonListQuery,
    ],
    successStatus: '200',
    successResponse: 'OkList',
  },

  {
    method: 'get',
    path: '/api/v1/certificates/validate',
    summary: 'Validate certificate',
    description: 'Validates certificate number and authenticity hash.',
    tags: ['Certificates'],
    queryParameters: [
      {
        name: 'certificate_number',
        description: 'Certificate number',
        required: true,
        schema: stringSchema,
      },
      {
        name: 'hash',
        description: 'Authenticity hash',
        required: true,
        schema: stringSchema,
      },
    ],
    successStatus: '200',
    successResponse: 'OkData',
  },
  {
    method: 'get',
    path: '/api/v1/certificates/:id/download',
    summary: 'Download certificate',
    description: 'Downloads certificate file for owner/admin.',
    tags: ['Certificates'],
    secured: true,
    successStatus: '200',
    successResponse: 'BinaryFileResponse',
    includeNotFound: true,
  },

  {
    method: 'post',
    path: '/api/v1/payments/simulate',
    summary: 'Simulate card payment',
    description: 'Creates and processes simulated credit card payment.',
    tags: ['Payments'],
    secured: true,
    requestBodyRef: 'PaymentSimulateCardRequest',
    successStatus: '201',
    successResponse: 'CreatedData',
  },
  {
    method: 'post',
    path: '/api/v1/payments/create-payment-intent',
    summary: 'Create Stripe PaymentIntent',
    description: 'Creates a Stripe PaymentIntent for card or Pix payment with Connect routing.',
    tags: ['Payments'],
    secured: true,
    requestBodyRef: 'PaymentCreateIntentRequest',
    successStatus: '201',
    successResponse: 'CreatedData',
  },
  {
    method: 'get',
    path: '/api/v1/payments/:id/status',
    summary: 'Get payment status',
    description: 'Fetches latest payment status and syncs compensation state.',
    tags: ['Payments'],
    secured: true,
    successStatus: '200',
    successResponse: 'OkData',
    includeNotFound: true,
  },
  {
    method: 'post',
    path: '/api/v1/payments/webhook',
    summary: 'Receive payment webhook',
    description: 'Processes signed payment status webhook from provider.',
    tags: ['Payments'],
    requestBodyRef: 'PaymentWebhookRequest',
    successStatus: '202',
    successResponse: 'AcceptedData',
  },
  {
    method: 'get',
    path: '/api/v1/locations/states',
    summary: 'List states of a country',
    description: 'Returns the states/provinces/regions for a given country code.',
    tags: ['Locations'],
    queryParameters: [
      { name: 'country', description: 'ISO 3166-1 alpha-2 country code', schema: { type: 'string', minLength: 2, maxLength: 2 } },
    ],
    successStatus: '200',
    successResponse: 'OkData',
  },
  {
    method: 'get',
    path: '/api/v1/locations/cities',
    summary: 'List cities of a state',
    description: 'Returns the cities for a given country and state.',
    tags: ['Locations'],
    queryParameters: [
      { name: 'country', description: 'ISO 3166-1 alpha-2 country code', schema: { type: 'string', minLength: 2, maxLength: 2 } },
      { name: 'state', description: 'State/province name', schema: { type: 'string' } },
    ],
    successStatus: '200',
    successResponse: 'OkData',
  },
  {
    method: 'post',
    path: '/api/v1/payments/reconcile',
    summary: 'Reconcile pending payments',
    description: 'Reconciles pending payments against gateway status.',
    tags: ['Payments'],
    secured: true,
    requestBodyRef: 'PaymentReconcileRequest',
    successStatus: '200',
    successResponse: 'OkData',
  },
  {
    method: 'post',
    path: '/api/v1/producers/stripe/onboard',
    summary: 'Start Stripe Connect onboarding',
    description: 'Creates an Express account and returns the onboarding URL.',
    tags: ['Producers', 'Stripe'],
    secured: true,
    successStatus: '200',
    successResponse: 'OkData',
  },
  {
    method: 'get',
    path: '/api/v1/producers/stripe/status',
    summary: 'Get Stripe Connect status',
    description: 'Returns onboarding and payout status for the producer.',
    tags: ['Producers', 'Stripe'],
    secured: true,
    successStatus: '200',
    successResponse: 'OkData',
  },
  {
    method: 'post',
    path: '/api/v1/producers/stripe/dashboard',
    summary: 'Access Stripe Express dashboard',
    description: 'Returns a one-time login link to the Stripe Express dashboard.',
    tags: ['Producers', 'Stripe'],
    secured: true,
    successStatus: '200',
    successResponse: 'OkData',
  },
  {
    method: 'get' as const,
    path: '/api/v1/stats/global',
    summary: 'Global platform statistics',
    description: 'Returns total areas, trees planted, and CO2 captured.',
    tags: ['Stats'],
    secured: false,
    successStatus: '200',
    successResponse: 'OkData',
  },
  {
    method: 'post',
    path: '/api/v1/users/:id/profile/avatar',
    summary: 'Upload profile avatar',
    description: 'Uploads and resizes profile photo for the user.',
    tags: ['Users'],
    secured: true,
    requestBodyRef: 'UploadProfileAvatarInput',
    successStatus: '200',
    successResponse: 'OkData',
  },
  {
    method: 'get',
    path: '/api/v1/users/:id/profile/avatar/file',
    summary: 'Get profile avatar file',
    description: 'Returns the avatar image file for the user profile.',
    tags: ['Users'],
    secured: false,
    successStatus: '200',
    successResponse: 'BinaryFileResponse',
  },
  {
    method: 'get',
    path: '/api/v1/users/:id/data-export',
    summary: 'Export user data',
    description: 'Returns all user data in JSON format for GDPR/LGPD data portability.',
    tags: ['Privacy'],
    secured: true,
    successStatus: '200',
    successResponse: 'OkData',
  },
  {
    method: 'post',
    path: '/api/v1/privacy/subject-request',
    summary: 'Create subject request',
    description: 'Submit a GDPR/LGPD data subject request (access, erasure, portability, etc.).',
    tags: ['Privacy'],
    secured: true,
    successStatus: '201',
    successResponse: 'OkData',
  },
  {
    method: 'get',
    path: '/api/v1/privacy/subject-requests',
    summary: 'List subject requests',
    description: 'List all data subject requests made by the authenticated user.',
    tags: ['Privacy'],
    secured: true,
    successStatus: '200',
    successResponse: 'OkData',
  },
  {
    method: 'post',
    path: '/api/v1/privacy/cookie-consent',
    summary: 'Record cookie consent',
    description: 'Records cookie consent preference for the authenticated user.',
    tags: ['Privacy'],
    secured: true,
    successStatus: '201',
    successResponse: 'OkData',
  },
  {
    method: 'post',
    path: '/api/v1/contact',
    summary: 'Send contact message',
    description: 'Sends a contact message from the authenticated user to all administrators.',
    tags: ['Contact'],
    secured: true,
    successStatus: '200',
    successResponse: 'OkData',
    requestBodyRef: 'ContactRequest',
  },
];

export const OPENAPI_ROUTE_SIGNATURES = routes.map(
  (route) => `${route.method.toUpperCase()} ${route.path}`
);

function toOpenApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function schemaRef(name: string): Record<string, unknown> {
  return { $ref: `#/components/schemas/${name}` };
}

function responseRef(name: string): Record<string, unknown> {
  return { $ref: `#/components/responses/${name}` };
}

function extractPathParameters(path: string): QueryParameter[] {
  const matches = path.match(/:([A-Za-z0-9_]+)/g) ?? [];
  return matches.map((token) => {
    const name = token.slice(1);
    return {
      name,
      description: `Path parameter: ${name}`,
      required: true,
      schema: stringSchema,
    };
  });
}

function operationResponses(route: ApiRouteDoc): Record<string, unknown> {
  const responses: Record<string, unknown> = {
    [route.successStatus]: responseRef(route.successResponse),
    '429': responseRef('TooManyRequests'),
    '500': responseRef('ServerError'),
  };

  const hasInput = route.requestBodyRef != null || (route.queryParameters?.length ?? 0) > 0;
  if (hasInput) {
    responses['400'] = responseRef('ValidationFailed');
  }

  if (route.secured) {
    responses['401'] = responseRef('Unauthorized');
    responses['403'] = responseRef('Forbidden');
  }

  if (route.includeNotFound || route.path.includes(':')) {
    responses['404'] = responseRef('NotFound');
  }

  return responses;
}

function buildPaths(): Record<string, Record<string, unknown>> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of routes) {
    const openApiPath = toOpenApiPath(route.path);
    const operation: Record<string, unknown> = {
      tags: route.tags,
      summary: route.summary,
      description: route.description,
      operationId: `${route.method}_${route.path
        .replaceAll('/', '_')
        .replaceAll(':', '')
        .replaceAll('-', '_')}`,
      responses: operationResponses(route),
      security: route.secured ? [{ BearerAuth: [] }] : [],
    };

    const parameters = [...extractPathParameters(route.path), ...(route.queryParameters ?? [])];
    if (parameters.length > 0) {
      operation.parameters = parameters.map((param) => ({
        name: param.name,
        in: extractPathParameters(route.path).some((item) => item.name === param.name)
          ? 'path'
          : 'query',
        description: param.description,
        required:
          extractPathParameters(route.path).some((item) => item.name === param.name) ||
          param.required === true,
        schema: param.schema,
      }));
    }

    if (route.requestBodyRef) {
      operation.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: schemaRef(route.requestBodyRef),
          },
        },
      };
    }

    const pathItem = paths[openApiPath] ?? {};
    pathItem[route.method] = operation;
    paths[openApiPath] = pathItem;
  }

  return paths;
}

export function buildOpenApiDocument(serverUrl: string): Record<string, unknown> {
  return {
    openapi: '3.0.3',
    info: {
      title: 'ClimaBalance API',
      version: '1.0.0',
      description:
        'API documentation generated from active routes. Default locale: pt-BR. Supported locales: pt-BR, es, en, fr.',
    },
    servers: [{ url: serverUrl }],
    tags: [
      { name: 'Docs' },
      { name: 'Auth' },
      { name: 'Users' },
      { name: 'Audit' },
      { name: 'Footprint' },
      { name: 'Areas' },
      { name: 'Area Media' },
      { name: 'Map' },
      { name: 'Updates' },
      { name: 'Compensations' },
      { name: 'Certificates' },
      { name: 'Payments' },
      { name: 'Locations' },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        ErrorEnvelope: {
          type: 'object',
          required: ['error'],
          properties: {
            error: {
              type: 'object',
              required: ['message_key'],
              properties: {
                message_key: { type: 'string' },
                details: {},
              },
            },
          },
        },
        SuccessDataEnvelope: {
          type: 'object',
          required: ['data'],
          properties: {
            data: { type: 'object', additionalProperties: true },
            message_key: { type: 'string' },
            messages: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
        SuccessListEnvelope: {
          type: 'object',
          required: ['data'],
          properties: {
            data: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
            },
            message_key: { type: 'string' },
          },
        },

        AuthRegisterRequest: {
          type: 'object',
          required: ['email', 'password', 'password_confirm', 'locale'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8 },
            password_confirm: { type: 'string', minLength: 8 },
            locale: { type: 'string', enum: ['pt-BR', 'es', 'en', 'fr'] },
            role_key: { type: 'string', enum: ['individual', 'producer', 'legal_entity'] },
          },
        },
        AuthLoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 1 },
          },
        },
        AuthConfirmEmailRequest: {
          type: 'object',
          required: ['token'],
          properties: { token: { type: 'string' } },
        },
        AuthResendConfirmationRequest: {
          type: 'object',
          required: ['email'],
          properties: { email: { type: 'string', format: 'email' } },
        },
        AuthPasswordResetRequest: {
          type: 'object',
          required: ['email', 'locale'],
          properties: {
            email: { type: 'string', format: 'email' },
            locale: { type: 'string', enum: ['pt-BR', 'es', 'en', 'fr'] },
          },
        },
        ContactRequest: {
          type: 'object',
          required: ['message'],
          properties: {
            message: { type: 'string', minLength: 1, maxLength: 5000 },
          },
        },
        AuthChangePasswordRequest: {
          type: 'object',
          required: ['old_password', 'new_password', 'new_password_confirm'],
          properties: {
            old_password: { type: 'string', minLength: 1 },
            new_password: { type: 'string', minLength: 8 },
            new_password_confirm: { type: 'string', minLength: 8 },
          },
        },
        AuthPasswordResetConfirmRequest: {
          type: 'object',
          required: ['token', 'password', 'password_confirm'],
          properties: {
            token: { type: 'string' },
            password: { type: 'string', minLength: 8 },
            password_confirm: { type: 'string', minLength: 8 },
          },
        },
        AuthRefreshRequest: {
          type: 'object',
          properties: {
            refresh_token: {
              type: 'string',
              description: 'Optional when refresh token is stored in HttpOnly cookie.',
            },
          },
        },
        AuthRevokeRequest: {
          type: 'object',
          properties: {
            refresh_token: {
              type: 'string',
              description: 'Optional when refresh token is stored in HttpOnly cookie.',
            },
          },
        },

        UserUpdateRequest: {
          type: 'object',
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8 },
            locale: { type: 'string' },
            status: { type: 'string', enum: ['active', 'pending', 'suspended'] },
          },
        },
        UserProfileUpsertRequest: {
          type: 'object',
          properties: {
            display_name: { type: 'string' },
            document_type: { type: 'string' },
            document_number: { type: 'string' },
            birth_date: { type: 'string' },
            phone: { type: 'string' },
            country_code: { type: 'string' },
            address_line1: { type: 'string' },
            address_line2: { type: 'string' },
            address_city: { type: 'string' },
            address_state: { type: 'string' },
            address_postal_code: { type: 'string' },
            address_country: { type: 'string' },
            about: { type: 'string' },
            website_url: { type: 'string', format: 'uri' },
            instagram_url: { type: 'string', format: 'uri' },
            facebook_url: { type: 'string', format: 'uri' },
            x_url: { type: 'string', format: 'uri' },
            bluesky_url: { type: 'string', format: 'uri' },
            mastodon_url: { type: 'string', format: 'uri' },
            youtube_url: { type: 'string', format: 'uri' },
            linkedin_url: { type: 'string', format: 'uri' },
          },
        },
        UploadProfileAvatarInput: {
          type: 'object',
          required: ['mime_type', 'file_base64'],
          properties: {
            mime_type: { type: 'string', enum: ['image/jpeg', 'image/png', 'image/webp'] },
            file_base64: { type: 'string', description: 'Base64-encoded image data' },
          },
        },

        FootprintCreateCalculationRequest: {
          type: 'object',
          required: ['profile_type', 'period_start', 'period_end', 'inputs'],
          properties: {
            profile_type: { type: 'string', enum: ['individual', 'legal_entity'] },
            period_start: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
            period_end: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
            data_quality: { type: 'string', enum: ['real', 'estimated', 'standard'] },
            factors_version: { type: 'string' },
            region: { type: 'string' },
            inputs: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                required: ['category', 'unit', 'value'],
                properties: {
                  category: {
                    type: 'string',
                    enum: ['energy', 'fuel', 'transport', 'flights', 'scope1', 'scope2', 'scope3'],
                  },
                  unit: { type: 'string' },
                  value: { type: 'number', exclusiveMinimum: 0 },
                  metadata: { type: 'object', additionalProperties: true },
                },
              },
            },
          },
        },
        FootprintUpdateCalculationRequest: {
          type: 'object',
          properties: {
            period_start: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
            period_end: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
            data_quality: { type: 'string', enum: ['real', 'estimated', 'standard'] },
            inputs: { type: 'array', items: { type: 'object', additionalProperties: true } },
          },
        },
        FootprintCreateProjectionRequest: {
          type: 'object',
          required: ['area_id'],
          properties: {
            area_id: uuidLikeSchema,
            horizon_years: { type: 'number', minimum: 1 },
          },
        },

        AreaCreateRequest: {
          type: 'object',
          required: ['name', 'latitude', 'longitude'],
          properties: {
            name: { type: 'string', minLength: 3, maxLength: 200 },
            description: { type: 'string', maxLength: 2000 },
            latitude: { type: 'number', minimum: -90, maximum: 90 },
            longitude: { type: 'number', minimum: -180, maximum: 180 },
            country_code: { type: 'string', minLength: 2, maxLength: 2 },
            state: { type: 'string', maxLength: 50 },
            city: { type: 'string', maxLength: 100 },
            totalCapacityTCO2e: { type: 'number', exclusiveMinimum: 0 },
            tCO2ePerTreePerYear: { type: 'number', exclusiveMinimum: 0 },
          },
        },
        AreaUpdateRequest: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 3, maxLength: 200 },
            description: { type: 'string', maxLength: 2000 },
            latitude: { type: 'number', minimum: -90, maximum: 90 },
            longitude: { type: 'number', minimum: -180, maximum: 180 },
            state: { type: 'string', maxLength: 50 },
            city: { type: 'string', maxLength: 100 },
            totalCapacityTCO2e: { type: 'number', exclusiveMinimum: 0 },
            tCO2ePerTreePerYear: { type: 'number', exclusiveMinimum: 0 },
          },
        },
        AreaApproveRequest: {
          type: 'object',
          required: ['criteria'],
          properties: {
            criteria: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                properties: {
                  criterionKey: { type: 'string' },
                  criterionLabel: { type: 'string' },
                  criterion_key: { type: 'string' },
                  criterion_label: { type: 'string' },
                  met: { type: 'boolean' },
                  notes: { type: 'string', nullable: true },
                },
              },
            },
            notes: { type: 'string' },
          },
        },
        AreaRejectRequest: {
          type: 'object',
          required: ['reason'],
          properties: { reason: { type: 'string', minLength: 10, maxLength: 2000 } },
        },
        AreaUploadMediaRequest: {
          type: 'object',
          required: ['media_type', 'mime_type', 'file_name', 'file_base64'],
          properties: {
            media_type: { type: 'string', enum: ['photo', 'video'] },
            description: { type: 'string', maxLength: 500 },
            mime_type: { type: 'string', minLength: 1, maxLength: 100 },
            file_name: { type: 'string', minLength: 1, maxLength: 255 },
            file_base64: { type: 'string', minLength: 1 },
          },
        },

        UpdateNotifyRequest: {
          type: 'object',
          required: ['buildId'],
          properties: {
            buildId: { type: 'string', minLength: 1 },
            timestamp: { type: 'number' },
          },
        },

        CompensationCreateRequest: {
          type: 'object',
          required: ['area_id', 'trees_requested', 'currency'],
          properties: {
            area_id: uuidLikeSchema,
            calculation_id: uuidLikeSchema,
            compensation_mode: { type: 'string', enum: ['tree_purchase'] },
            trees_requested: { type: 'integer', minimum: 1 },
            currency: { type: 'string', minLength: 3, maxLength: 3 },
          },
        },
        CompensationQuoteRequest: {
          type: 'object',
          required: ['area_id', 'trees_requested', 'currency'],
          properties: {
            area_id: uuidLikeSchema,
            trees_requested: { type: 'integer', minimum: 1 },
            currency: { type: 'string', minLength: 3, maxLength: 3 },
          },
        },

        PaymentSimulateCardRequest: {
          type: 'object',
          required: [
            'compensation_id',
            'card_number',
            'cardholder_name',
            'expiration_month',
            'expiration_year',
            'cvv',
            'installments',
          ],
          properties: {
            compensation_id: uuidLikeSchema,
            card_number: { type: 'string', minLength: 12, maxLength: 25 },
            cardholder_name: { type: 'string', minLength: 2, maxLength: 120 },
            expiration_month: { type: 'integer', minimum: 1, maximum: 12 },
            expiration_year: { type: 'integer', minimum: 2000, maximum: 9999 },
            cvv: { type: 'string', minLength: 3, maxLength: 4 },
            installments: { type: 'integer', minimum: 1, maximum: 12 },
          },
        },
        PaymentWebhookRequest: {
          type: 'object',
          required: ['provider', 'event', 'data'],
          properties: {
            provider: { type: 'string', enum: ['card_simulator'] },
            event: { type: 'string', enum: ['payment.updated'] },
            data: {
              type: 'object',
              required: ['provider_reference'],
              properties: {
                provider_reference: { type: 'string', minLength: 8, maxLength: 140 },
              },
            },
          },
        },
        PaymentReconcileRequest: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
          },
        },
      },
      responses: {
        OkData: {
          description: 'Successful response with data object',
          content: { 'application/json': { schema: schemaRef('SuccessDataEnvelope') } },
        },
        OkList: {
          description: 'Successful response with data list',
          content: { 'application/json': { schema: schemaRef('SuccessListEnvelope') } },
        },
        CreatedData: {
          description: 'Created resource',
          content: { 'application/json': { schema: schemaRef('SuccessDataEnvelope') } },
        },
        AcceptedData: {
          description: 'Accepted for async processing',
          content: { 'application/json': { schema: schemaRef('SuccessDataEnvelope') } },
        },
        NoContent: {
          description: 'No content',
        },
        BinaryFileResponse: {
          description: 'Binary file content',
          content: {
            'application/pdf': {
              schema: { type: 'string', format: 'binary' },
            },
            'application/octet-stream': {
              schema: { type: 'string', format: 'binary' },
            },
          },
        },
        EventStreamResponse: {
          description: 'Server-Sent Events stream',
          content: {
            'text/event-stream': {
              schema: { type: 'string' },
            },
          },
        },
        HtmlDocumentResponse: {
          description: 'HTML document',
          content: {
            'text/html': {
              schema: { type: 'string' },
            },
          },
        },
        ValidationFailed: {
          description: 'Validation failure',
          content: { 'application/json': { schema: schemaRef('ErrorEnvelope') } },
        },
        BadRequest: {
          description: 'Bad request',
          content: { 'application/json': { schema: schemaRef('ErrorEnvelope') } },
        },
        Unauthorized: {
          description: 'Authentication required or invalid token',
          content: { 'application/json': { schema: schemaRef('ErrorEnvelope') } },
        },
        Forbidden: {
          description: 'Forbidden',
          content: { 'application/json': { schema: schemaRef('ErrorEnvelope') } },
        },
        NotFound: {
          description: 'Entity not found',
          content: { 'application/json': { schema: schemaRef('ErrorEnvelope') } },
        },
        TooManyRequests: {
          description: 'Rate limited',
          content: { 'application/json': { schema: schemaRef('ErrorEnvelope') } },
        },
        ServerError: {
          description: 'Unexpected server error',
          content: { 'application/json': { schema: schemaRef('ErrorEnvelope') } },
        },
      },
    },
    paths: buildPaths(),
  };
}

export function openApiJsonHandler(ctx: HttpContext): Response {
  const serverUrl = getRequestOrigin(ctx.request);
  return jsonResponse(200, buildOpenApiDocument(serverUrl));
}

export function swaggerUiHandler(ctx: HttpContext): Response {
  const openApiUrl = `${getRequestOrigin(ctx.request)}/api/v1/openapi.json`;

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ClimaBalance API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
    <style>
      body { margin: 0; background: #f7fafc; }
      .topbar { display: none; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: "${openApiUrl}",
        dom_id: '#swagger-ui',
        deepLinking: true,
        docExpansion: 'list',
        persistAuthorization: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIBundle.SwaggerUIStandalonePreset
        ]
      });
    </script>
  </body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
    },
  });
}
