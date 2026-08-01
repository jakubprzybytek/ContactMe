import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { Resource } from "sst";

const MAX_SUBJECT_LENGTH = 200;
const MAX_MESSAGE_LENGTH = 5000;
const MAX_EMAIL_LENGTH = 254;
const MIN_RECAPTCHA_SCORE = 0.5;
const RECAPTCHA_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ses = new SESv2Client({});

type ContactRequest = {
  subject?: unknown;
  message?: unknown;
  email?: unknown;
  recaptchaToken?: unknown;
};

type ParsedContact = {
  subject: string;
  message: string;
  email: string;
  recaptchaToken: string;
};

function response(
  statusCode: number,
  body: Record<string, unknown>,
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Strips characters that could be used to inject extra email headers.
 */
function sanitizeHeaderValue(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\r\n\u0000-\u001f\u007f]/g, " ").trim();
}

function parseRequest(rawBody: string | undefined): ParsedContact | string {
  let payload: ContactRequest;
  try {
    payload = JSON.parse(rawBody ?? "") as ContactRequest;
  } catch {
    return "Invalid request body.";
  }
  if (typeof payload !== "object" || payload === null) {
    return "Invalid request body.";
  }

  const message = asTrimmedString(payload.message);
  if (!message) {
    return "Message is required.";
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return `Message must be at most ${MAX_MESSAGE_LENGTH} characters.`;
  }

  const subject = asTrimmedString(payload.subject);
  if (subject.length > MAX_SUBJECT_LENGTH) {
    return `Subject must be at most ${MAX_SUBJECT_LENGTH} characters.`;
  }

  const email = asTrimmedString(payload.email);
  if (email && (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email))) {
    return "Email address is invalid.";
  }

  const recaptchaToken = asTrimmedString(payload.recaptchaToken);
  if (!recaptchaToken) {
    return "Captcha verification is required.";
  }

  return { subject, message, email, recaptchaToken };
}

async function verifyRecaptcha(
  token: string,
  remoteIp: string | undefined,
): Promise<boolean> {
  const params = new URLSearchParams({
    secret: Resource.RecaptchaSecretKey.value,
    response: token,
  });
  if (remoteIp) {
    params.set("remoteip", remoteIp);
  }

  const result = await fetch(RECAPTCHA_VERIFY_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!result.ok) {
    console.error("reCAPTCHA verification request failed", result.status);
    return false;
  }

  const body = (await result.json()) as {
    success?: boolean;
    score?: number;
    "error-codes"?: string[];
  };
  if (!body.success) {
    console.warn("reCAPTCHA rejected submission", body["error-codes"]);
    return false;
  }
  // reCAPTCHA v3 returns a score, v2 does not.
  if (typeof body.score === "number" && body.score < MIN_RECAPTCHA_SCORE) {
    console.warn("reCAPTCHA score below threshold", body.score);
    return false;
  }
  return true;
}

async function sendEmail(contact: ParsedContact): Promise<void> {
  const subject = contact.subject
    ? `[ContactMe] ${sanitizeHeaderValue(contact.subject)}`
    : "[ContactMe] New message";

  const bodyText = [
    `From: ${contact.email || "(not provided)"}`,
    "",
    contact.message,
  ].join("\n");

  await ses.send(
    new SendEmailCommand({
      FromEmailAddress: Resource.SenderEmail.value,
      Destination: { ToAddresses: [Resource.ContactEmail.value] },
      ReplyToAddresses: contact.email ? [contact.email] : undefined,
      Content: {
        Simple: {
          Subject: { Data: subject, Charset: "UTF-8" },
          Body: { Text: { Data: bodyText, Charset: "UTF-8" } },
        },
      },
    }),
  );
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  if (event.requestContext?.http?.method !== "POST") {
    return response(405, { ok: false, error: "Method not allowed." });
  }

  const rawBody = event.isBase64Encoded && event.body
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;

  const parsed = parseRequest(rawBody);
  if (typeof parsed === "string") {
    return response(400, { ok: false, error: parsed });
  }

  try {
    const verified = await verifyRecaptcha(
      parsed.recaptchaToken,
      event.requestContext?.http?.sourceIp,
    );
    if (!verified) {
      return response(400, {
        ok: false,
        error: "Captcha verification failed. Please try again.",
      });
    }

    await sendEmail(parsed);
    return response(200, { ok: true });
  } catch (error) {
    console.error("Failed to handle contact submission", error);
    return response(500, {
      ok: false,
      error: "Could not send the message. Please try again later.",
    });
  }
}
