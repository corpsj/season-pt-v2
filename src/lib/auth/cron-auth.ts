export type CronAuthorization =
  | { ok: true }
  | { ok: false; status: 401 | 503; message: "unauthorized" | "maintenance unavailable" };

/** Pure, fail-closed authorization decision for the maintenance Route Handler. */
export function authorizeCronRequest(
  configuredSecret: string | undefined,
  authorization: string | null,
): CronAuthorization {
  if (!configuredSecret) {
    return { ok: false, status: 503, message: "maintenance unavailable" };
  }
  if (authorization !== `Bearer ${configuredSecret}`) {
    return { ok: false, status: 401, message: "unauthorized" };
  }
  return { ok: true };
}
