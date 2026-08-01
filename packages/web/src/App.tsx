import { useState, type FormEvent } from "react";
import { getRecaptchaToken } from "./recaptcha";
import "./App.css";

const API_URL: string = import.meta.env.VITE_API_URL ?? "";

const MAX_SUBJECT_LENGTH = 200;
const MAX_MESSAGE_LENGTH = 5000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Status =
  | { state: "idle" }
  | { state: "sending" }
  | { state: "sent" }
  | { state: "error"; message: string };

function validate(subject: string, message: string, email: string) {
  if (!message.trim()) return "Please write a message.";
  if (message.length > MAX_MESSAGE_LENGTH)
    return `Message must be at most ${MAX_MESSAGE_LENGTH} characters.`;
  if (subject.length > MAX_SUBJECT_LENGTH)
    return `Subject must be at most ${MAX_SUBJECT_LENGTH} characters.`;
  if (email.trim() && !EMAIL_PATTERN.test(email.trim()))
    return "Please enter a valid email address.";
  return undefined;
}

export default function App() {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ state: "idle" });

  const sending = status.state === "sending";
  const error = status.state === "error" ? status.message : undefined;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationError = validate(subject, message, email);
    if (validationError) {
      setStatus({ state: "error", message: validationError });
      return;
    }

    setStatus({ state: "sending" });
    try {
      const recaptchaToken = await getRecaptchaToken("contact");
      const result = await fetch(API_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim(),
          message: message.trim(),
          email: email.trim(),
          recaptchaToken,
        }),
      });
      const body = (await result.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!result.ok || !body.ok) {
        setStatus({
          state: "error",
          message: body.error ?? "Could not send the message. Please try again.",
        });
        return;
      }
      setStatus({ state: "sent" });
      setSubject("");
      setMessage("");
      setEmail("");
    } catch {
      setStatus({
        state: "error",
        message: "Could not send the message. Please try again.",
      });
    }
  }

  return (
    <main className="page">
      <h1>Contact me</h1>
      <p className="intro">
        Send me a message using the form below. Leave your email address if you
        would like a response.
      </p>

      <form className="form" onSubmit={onSubmit} noValidate>
        <label htmlFor="subject">
          Subject <span className="optional">(optional)</span>
        </label>
        <input
          id="subject"
          name="subject"
          type="text"
          maxLength={MAX_SUBJECT_LENGTH}
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          disabled={sending}
        />

        <label htmlFor="message">Message</label>
        <textarea
          id="message"
          name="message"
          rows={8}
          required
          maxLength={MAX_MESSAGE_LENGTH}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          disabled={sending}
        />

        <label htmlFor="email">
          Your email <span className="optional">(optional)</span>
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={sending}
        />

        <button type="submit" disabled={sending}>
          {sending ? "Sending…" : "Send message"}
        </button>

        {status.state === "sent" && (
          <p className="status" role="status" aria-live="polite">
            Thanks! Your message has been sent.
          </p>
        )}
        {error && (
          <p className="status error" role="alert">
            {error}
          </p>
        )}
      </form>

      <p className="legal">
        This site is protected by reCAPTCHA and the Google{" "}
        <a href="https://policies.google.com/privacy">Privacy Policy</a> and{" "}
        <a href="https://policies.google.com/terms">Terms of Service</a> apply.
      </p>
    </main>
  );
}
