import { Resource } from "sst";

/** The stage the tests run against (from sst shell); refuses prod (agent-playbook/continuous-delivery). */
export function testStage() {
  let stage: string;
  try {
    stage = Resource.App.stage;
  } catch {
    throw new Error("Run the tests inside sst shell: npx sst shell --stage dev -- npm run test:e2e");
  }
  if (stage === "prod") throw new Error("Tests don't run against prod.");
  return { stage, apiUrl: Resource.ApiRouter.url, siteUrl: Resource.Web.url };
}
