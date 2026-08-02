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
    const webDomain =
      $app.stage === "int"
        ? "contactme.albedoonline.com"
        : `${$app.stage}.contactme.albedoonline.com`;
    const apiDomain = `api.${webDomain}`;
    const contactEmail = process.env.CONTACT_EMAIL;
    const senderEmail = process.env.SENDER_EMAIL;
    const recaptchaSiteKey = process.env.RECAPTCHA_SITE_KEY;
    if (!contactEmail || !senderEmail || !recaptchaSiteKey) {
      throw new Error(
        "CONTACT_EMAIL, SENDER_EMAIL, and RECAPTCHA_SITE_KEY must be set.",
      );
    }

    const recaptchaSecretKey = new sst.Secret("RecaptchaSecretKey");
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
      link: [recaptchaSecretKey],
      environment: {
        CONTACT_EMAIL: contactEmail,
        SENDER_EMAIL: senderEmail,
      },
      permissions: [
        {
          actions: ["ses:SendEmail"],
          resources: ["*"],
        },
      ],
      url: {
        cors: {
          allowOrigins: [`https://${webDomain}`],
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
        VITE_RECAPTCHA_SITE_KEY: recaptchaSiteKey,
      },
    });

    return {
      api: apiRouter.url,
      site: site.url,
    };
  },
});
