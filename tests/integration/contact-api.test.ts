import { describe, expect, it } from "vitest";
import { testStage } from "../stage";

// Off prod the API logs submissions instead of emailing them, and needs no captcha.
const { apiUrl, siteUrl } = testStage();

const post = (body: unknown) =>
  fetch(apiUrl, {
    method: "POST",
    headers: { "content-type": "application/json", origin: siteUrl },
    body: JSON.stringify(body),
  });

describe("contact API", () => {
  it("accepts a valid message and doesn't deliver it", async () => {
    const response = await post({ subject: "Integration test", message: "Hello from the integration tests." });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, delivered: false });
    expect(response.headers.get("access-control-allow-origin")).toBe(siteUrl);
  });

  it("rejects an invalid submission", async () => {
    const response = await post({ message: "hi", email: "not-an-address" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "Email address is invalid." });
  });

  it("answers only POST", async () => {
    expect((await fetch(apiUrl)).status).toBe(405);
  });
});
