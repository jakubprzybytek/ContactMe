/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "contact-me",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "aws",
      providers: {
        aws: {
          region: (process.env.AWS_REGION ?? "eu-central-1") as any,
        },
      },
    };
  },
  async run() {
    // Destination mailbox that contact form submissions are forwarded to.
    const contactEmail = new sst.Secret("ContactEmail");
    // SES verified identity used as the "From" address.
    const senderEmail = new sst.Secret("SenderEmail");
    // Google reCAPTCHA v3 keys. The site key is public, the secret key is not.
    const recaptchaSecretKey = new sst.Secret("RecaptchaSecretKey");
    const recaptchaSiteKey = new sst.Secret("RecaptchaSiteKey");

    const api = new sst.aws.Function("ContactApi", {
      handler: "packages/functions/src/contact.handler",
      runtime: "nodejs22.x",
      timeout: "20 seconds",
      link: [contactEmail, senderEmail, recaptchaSecretKey],
      permissions: [
        {
          actions: ["ses:SendEmail"],
          resources: ["*"],
        },
      ],
      url: {
        cors: {
          // The static site is served from a CloudFront domain that is only
          // known after this function is created, so the public form endpoint
          // accepts any origin. No credentials or cookies are used.
          allowOrigins: ["*"],
          allowMethods: ["POST"],
          allowHeaders: ["content-type"],
        },
      },
    });

    const site = new sst.aws.StaticSite("Web", {
      path: "packages/web",
      build: {
        command: "npm run build",
        output: "dist",
      },
      environment: {
        VITE_API_URL: api.url,
        VITE_RECAPTCHA_SITE_KEY: recaptchaSiteKey.value,
      },
    });

    return {
      api: api.url,
      site: site.url,
    };
  },
});
