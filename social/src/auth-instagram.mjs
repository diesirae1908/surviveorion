/**
 * One-time Instagram token dance. Walks the steps. Do not run against Graph from the pipeline.
 */

import { pathToFileURL } from "node:url";

export function instagramAuthSteps() {
  return [
    "1. Graph API Explorer: get a short-lived user token with pages_show_list, instagram_basic, instagram_content_publish, pages_read_engagement, business_management.",
    "2. Exchange it long-lived: GET /oauth/access_token?grant_type=fb_exchange_token&client_id=APP&client_secret=SECRET&fb_exchange_token=SHORT",
    "3. Resolve the Page token and IG_USER_ID: GET /me/accounts?fields=instagram_business_account",
    "4. Store IG_USER_ID and IG_ACCESS_TOKEN in .env. The app can stay in Dev Mode.",
  ];
}

async function main(argv) {
  console.log("Instagram auth (see AUTH.md):\n");
  for (const line of instagramAuthSteps()) console.log(line);
  if (argv.includes("--print-steps")) return;
  console.log("\nNot exchanging tokens in this run.");
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  await main(process.argv.slice(2));
}
