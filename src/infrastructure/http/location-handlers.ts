import type { HttpContext } from "../../shared/http/router";
import { jsonResponse, errorResponse } from "../../shared/http/response";
import { buildLogContext } from "../../shared/http/log-context";
import { getLogger } from "../../shared/utils/logger";
import { handleError } from "./error-mapper";
import { countryStates } from "./location-data";

export function createLocationHandlers() {
  return {
    async listStates(ctx: HttpContext) {
      const logContext = buildLogContext(ctx);
      const log = getLogger(logContext);
      try {
        const countryCode = (ctx.query.get("country") || "")
          .toUpperCase()
          .trim();
        if (!countryCode || countryCode.length !== 2) {
          return errorResponse(
            400,
            "location.invalid_country",
            undefined,
            logContext,
          );
        }

        const states: string[] = [...(countryStates[countryCode] ?? [])];

        if (states.length === 0) {
          try {
            const res = await fetch(
              "https://countriesnow.ng/api/v0.1/countries/states",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ country: countryCode }),
                signal: ctx.request.signal,
              },
            );
            if (res.ok) {
              const body: any = await res.json();
              if (body?.data?.states) {
                states.push(
                  ...body.data.states.map((s: any) => s.name).filter(Boolean),
                );
              }
            }
          } catch (e: any) {
            log.warn("location.states_api_failed", {
              country: countryCode,
              error: e?.message,
            });
          }
        }

        log.info("location.states_fetched", {
          country: countryCode,
          states: states.length,
        });
        return jsonResponse(200, { data: states }, logContext);
      } catch (error) {
        return handleError(error, log, logContext);
      }
    },

    async listCities(ctx: HttpContext) {
      const logContext = buildLogContext(ctx);
      const log = getLogger(logContext);
      try {
        const countryCode = (ctx.query.get("country") || "")
          .toUpperCase()
          .trim();
        const stateName = ctx.query.get("state") || "";

        if (!countryCode || countryCode.length !== 2 || !stateName) {
          return errorResponse(
            400,
            "location.invalid_params",
            undefined,
            logContext,
          );
        }

        const cities: string[] = [];

        try {
          const countryRes = await fetch(
            `https://restcountries.com/v3.1/alpha/${countryCode}`,
            {
              signal: ctx.request.signal,
              headers: { Accept: "application/json" },
            },
          );
          if (countryRes.ok) {
            const countryData: any = await countryRes.json();
            const countryName = countryData?.[0]?.name?.common;
            if (countryName) {
              const res = await fetch(
                "https://countriesnow.ng/api/v0.1/countries/state/cities",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    country: countryName,
                    state: stateName,
                  }),
                  signal: ctx.request.signal,
                },
              );
              if (res.ok) {
                const body: any = await res.json();
                if (body?.data) {
                  for (const c of body.data) {
                    if (typeof c === "string" && c.trim())
                      cities.push(c.trim());
                  }
                }
              }
            }
          }
        } catch (e: any) {
          log.warn("location.cities_api_failed", {
            country: countryCode,
            state: stateName,
            error: e?.message,
          });
        }

        log.info("location.cities_fetched", {
          country: countryCode,
          state: stateName,
          cities: cities.length,
        });
        return jsonResponse(200, { data: cities }, logContext);
      } catch (error) {
        return handleError(error, log, logContext);
      }
    },
  };
}
