import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

const send = vi.fn();
vi.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: class {
    send = send;
  },
  SendEmailCommand: class {
    constructor(public input: unknown) {}
  },
}));
vi.mock("sst", () => ({ Resource: { RecaptchaSecretKey: { value: "test-secret" } } }));

const { handler, parseRequest } = await import("./contact");

function post(body: unknown, method = "POST"): APIGatewayProxyEventV2 {
  return {
    body: typeof body === "string" ? body : JSON.stringify(body),
    isBase64Encoded: false,
    requestContext: { http: { method, sourceIp: "203.0.113.7" } },
  } as unknown as APIGatewayProxyEventV2;
}

async function call(body: unknown, method?: string) {
  const result = await handler(post(body, method));
  return { status: result.statusCode, body: JSON.parse(result.body as string) };
}

const fetchMock = vi.fn();

beforeEach(() => {
  send.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("parseRequest", () => {
  it("rejects bodies that aren't a JSON object", () => {
    expect(parseRequest("not json", false)).toBe("Invalid request body.");
    expect(parseRequest("null", false)).toBe("Invalid request body.");
  });

  it("needs a message, within the length limits", () => {
    expect(parseRequest(JSON.stringify({ message: "  " }), false)).toBe("Message is required.");
    expect(parseRequest(JSON.stringify({ message: "x".repeat(5001) }), false)).toMatch(/at most 5000/);
    expect(parseRequest(JSON.stringify({ message: "hi", subject: "s".repeat(201) }), false)).toMatch(/at most 200/);
  });

  it("checks the optional email address", () => {
    expect(parseRequest(JSON.stringify({ message: "hi", email: "nope" }), false)).toBe("Email address is invalid.");
    expect(parseRequest(JSON.stringify({ message: "hi", email: "a@b.co" }), false)).toMatchObject({ email: "a@b.co" });
  });

  it("asks for a captcha token only when required", () => {
    expect(parseRequest(JSON.stringify({ message: "hi" }), true)).toBe("Captcha verification is required.");
    expect(parseRequest(JSON.stringify({ message: " hi " }), false)).toEqual({
      subject: "",
      message: "hi",
      email: "",
      recaptchaToken: "",
    });
  });
});

describe("handler, log mode (dev, int)", () => {
  beforeEach(() => {
    vi.stubEnv("DELIVERY", "log");
  });

  it("accepts a valid message without a captcha and sends nothing", async () => {
    expect(await call({ message: "hello" })).toEqual({ status: 200, body: { ok: true, delivered: false } });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("still validates", async () => {
    expect(await call({ message: "" })).toEqual({ status: 400, body: { ok: false, error: "Message is required." } });
  });

  it("answers only POST", async () => {
    expect((await call({ message: "hello" }, "GET")).status).toBe(405);
  });

  it("is the default when DELIVERY isn't set", async () => {
    vi.stubEnv("DELIVERY", undefined);
    expect((await call({ message: "hello" })).body).toEqual({ ok: true, delivered: false });
  });
});

describe("handler, email mode (prod)", () => {
  beforeEach(() => {
    vi.stubEnv("DELIVERY", "email");
    vi.stubEnv("CONTACT_EMAIL", "inbox@example.com");
    vi.stubEnv("SENDER_EMAIL", "no-reply@example.com");
  });

  const captcha = (body: unknown, ok = true) =>
    fetchMock.mockResolvedValue({ ok, status: ok ? 200 : 500, json: async () => body });

  it("needs a captcha token", async () => {
    expect((await call({ message: "hello" })).body.error).toBe("Captcha verification is required.");
  });

  it("verifies the token with the secret and the sender's IP, then sends the email", async () => {
    captcha({ success: true, score: 0.9 });
    send.mockResolvedValue({});
    const result = await call({
      subject: "Hi\r\nBcc: x@y.z",
      message: "hello",
      email: "me@example.com",
      recaptchaToken: "tok",
    });
    expect(result).toEqual({ status: 200, body: { ok: true, delivered: true } });

    const params = new URLSearchParams(fetchMock.mock.calls[0][1].body);
    expect(Object.fromEntries(params)).toEqual({ secret: "test-secret", response: "tok", remoteip: "203.0.113.7" });

    const input = send.mock.calls[0][0].input;
    expect(input.Destination.ToAddresses).toEqual(["inbox@example.com"]);
    expect(input.FromEmailAddress).toBe("no-reply@example.com");
    expect(input.ReplyToAddresses).toEqual(["me@example.com"]);
    // No header injection through the subject.
    expect(input.Content.Simple.Subject.Data).toBe("[ContactMe] Hi  Bcc: x@y.z");
  });

  it("rejects a failed or low-score captcha without sending", async () => {
    captcha({ success: false, "error-codes": ["invalid-input-response"] });
    expect((await call({ message: "hello", recaptchaToken: "tok" })).status).toBe(400);
    captcha({ success: true, score: 0.2 });
    expect((await call({ message: "hello", recaptchaToken: "tok" })).status).toBe(400);
    captcha({}, false);
    expect((await call({ message: "hello", recaptchaToken: "tok" })).status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });

  it("answers 500 when SES fails", async () => {
    captcha({ success: true, score: 0.9 });
    send.mockRejectedValue(new Error("throttled"));
    expect((await call({ message: "hello", recaptchaToken: "tok" })).status).toBe(500);
  });
});
