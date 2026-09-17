import { describe, expect, test } from "bun:test";
import { authorizeCronRequest } from "./cron-auth";

describe("authorizeCronRequest", () => {
  test("fails closed with 503 when CRON_SECRET is missing", () => {
    expect(authorizeCronRequest(undefined, null)).toEqual({
      ok: false,
      status: 503,
      message: "maintenance unavailable",
    });
  });

  test("rejects a missing authorization header", () => {
    expect(authorizeCronRequest("secret", null)).toEqual({
      ok: false,
      status: 401,
      message: "unauthorized",
    });
  });

  test("rejects a wrong bearer secret", () => {
    expect(authorizeCronRequest("secret", "Bearer wrong")).toEqual({
      ok: false,
      status: 401,
      message: "unauthorized",
    });
  });

  test("accepts the exact configured bearer secret", () => {
    expect(authorizeCronRequest("secret", "Bearer secret")).toEqual({ ok: true });
  });
});
