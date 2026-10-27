/// <reference path="./.sst/platform/config.d.ts" />

// Stages per agent-playbook/continuous-delivery: dev (yours), int (the pipeline's tests), prod (live).
const ROOT_DOMAIN = "contactme.albedoonline.com";

export default $config({
  app(input) {
    return {
      name: "contact-me",
      removal: input?.stage === "prod" ? "retain" : "remove",
      protect: input?.stage === "prod",
      home: "aws",
      providers: {
        aws: {
          region: (process.env.AWS_REGION ?? "eu-west-1") as any,
        },
      },
    };
  },
  async run() {
    // The one place that decides what differs per stage. Off prod, the form neither checks reCAPTCHA
    // nor sends email: the function logs the submission and answers { ok: true, delivered: false }.
    const isProd = $app.stage === "prod";

    const webDomain = isProd ? ROOT_DOMAIN : `${$app.stage}.${ROOT_DOMAIN}`;
    const apiDomain = `api.${webDomain}`;

    let delivery: { recaptchaSecretKey: sst.Secret; contactEmail: string; senderEmail: string; recaptchaSiteKey: string } | undefined;
    if (isProd) {
      const { CONTACT_EMAIL, SENDER_EMAIL, RECAPTCHA_SITE_KEY } = process.env;
      if (!CONTACT_EMAIL || !SENDER_EMAIL || !RECAPTCHA_SITE_KEY) {
        throw new Error("prod needs CONTACT_EMAIL, SENDER_EMAIL and RECAPTCHA_SITE_KEY.");
      }
      delivery = {
        recaptchaSecretKey: new sst.Secret("RecaptchaSecretKey"),
        contactEmail: CONTACT_EMAIL,
        senderEmail: SENDER_EMAIL,
        recaptchaSiteKey: RECAPTCHA_SITE_KEY,
      };
    }

    const usEast1 = new aws.Provider("UsEast1", {
      region: "us-east-1",
    });
    const certificate = new sst.aws.DnsValidatedCertificate(
      "SharedCertificate",
      {
        domainName: webDomain,
        alternativeNames: [apiDomain],
        dns: sst.aws.dns(),
      },
      { provider: usEast1 },
    );

    const api = new sst.aws.Function("ContactApi", {
      handler: "packages/functions/src/contact.handler",
      runtime: "nodejs24.x",
      timeout: "20 seconds",
      link: delivery ? [delivery.recaptchaSecretKey] : [],
      environment: delivery
        ? { DELIVERY: "email", CONTACT_EMAIL: delivery.contactEmail, SENDER_EMAIL: delivery.senderEmail }
        : { DELIVERY: "log" },
      permissions: delivery ? [{ actions: ["ses:SendEmail"], resources: ["*"] }] : [],
      url: {
        cors: {
          // Off prod also the local Vite dev server.
          allowOrigins: isProd ? [`https://${webDomain}`] : [`https://${webDomain}`, "http://localhost:5173"],
          allowMethods: ["POST"],
          allowHeaders: ["content-type"],
        },
      },
    });

    const apiRouter = new sst.aws.Router("ApiRouter", {
      domain: {
        name: apiDomain,
        cert: certificate.arn,
      },
      routes: {
        "/*": api.url,
      },
    });

    const site = new sst.aws.StaticSite("Web", {
      path: "packages/web",
      domain: {
        name: webDomain,
        cert: certificate.arn,
      },
      build: {
        command: "npm run build",
        output: "dist",
      },
      environment: {
        VITE_API_URL: apiRouter.url,
        // Empty off prod: the page doesn't load reCAPTCHA.
        VITE_RECAPTCHA_SITE_KEY: delivery?.recaptchaSiteKey ?? "",
        // The release shown in the footer: the tag (v0.1, …) from the pipeline, "local" otherwise.
        VITE_APP_VERSION: process.env.APP_VERSION ?? "local",
      },
    });

    return {
      api: apiRouter.url,
      site: site.url,
    };
  },
});
