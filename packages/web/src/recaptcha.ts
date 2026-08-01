const SCRIPT_ID = "recaptcha-v3";

export const recaptchaSiteKey: string =
  import.meta.env.VITE_RECAPTCHA_SITE_KEY ?? "";

declare global {
  interface Window {
    grecaptcha?: {
      ready: (callback: () => void) => void;
      execute: (siteKey: string, options: { action: string }) => Promise<string>;
    };
  }
}

let loader: Promise<void> | undefined;

function loadScript(): Promise<void> {
  if (loader) return loader;

  loader = new Promise<void>((resolve, reject) => {
    if (!recaptchaSiteKey) {
      reject(new Error("reCAPTCHA site key is not configured."));
      return;
    }
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(
      recaptchaSiteKey,
    )}`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load reCAPTCHA."));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    loader = undefined;
    throw error;
  });

  return loader;
}

/**
 * Loads reCAPTCHA v3 on demand and returns a token for the given action.
 */
export async function getRecaptchaToken(action: string): Promise<string> {
  await loadScript();

  const grecaptcha = window.grecaptcha;
  if (!grecaptcha) {
    throw new Error("reCAPTCHA is not available.");
  }

  await new Promise<void>((resolve) => grecaptcha.ready(resolve));
  return grecaptcha.execute(recaptchaSiteKey, { action });
}
