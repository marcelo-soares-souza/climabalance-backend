import type { AreaRepository } from "../../domain/areas/repositories/area-repository";
import type { HttpContext } from "../../shared/http/router";
import { jsonResponse } from "../../shared/http/response";
import { handleError } from "./error-mapper";
import { buildLogContext } from "../../shared/http/log-context";
import { getGlobalStats } from "../../application/stats/get-global-stats";

export type StatsHandlersDeps = {
  areaRepository: AreaRepository;
};

export function createStatsHandlers(deps: StatsHandlersDeps) {
  return {
    global: async (_ctx: HttpContext) => {
      const logContext = buildLogContext(_ctx);
      try {
        const stats = await getGlobalStats({
          areaRepository: deps.areaRepository,
        });
        return jsonResponse(200, { data: stats }, logContext);
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },
  };
}
