### YouTube, ~10 minutes, once

1. console.cloud.google.com -> New project `orion-social`.
2. APIs & Services -> Library -> enable **YouTube Data API v3**.
3. OAuth consent screen: External, app name `ORION Social`, your email everywhere. Add
   yourself as the only user, then **Publish app** (Production). Unverified-production shows
   a warning screen you click through once; the alternative, Testing mode, expires refresh
   tokens every 7 days, which kills automation. Publish it.
4. Credentials -> Create credentials -> OAuth client ID -> **Desktop app** -> download the
   JSON to `auth/google-client.json`.
5. `npm run auth:youtube`: prints the consent URL. Open it, approve with the Google account
   that owns the @SurviveOrion channel, paste the code back. The refresh token lands in
   `.env` (`YT_REFRESH_TOKEN`). This URL is the "one OAuth consent"; it can only be minted
   from your own client JSON, which is why steps 1-4 exist.

### Instagram, ~15 minutes, once

1. **Create a Facebook Page** (this is the piece the IG app never explains):
   facebook.com/pages/create, name `ORION`, category Video game. Your personal profile is
   the admin; the Page is just API plumbing and needs no content, ever.
2. **Link IG to the Page**: Instagram app -> Edit profile -> under Public business
   information tap **Page** -> Connect existing page -> pick `ORION`. (If the app hides it:
   facebook.com -> the Page -> Settings -> Linked accounts -> Instagram -> Connect.)
3. developers.facebook.com -> Create app -> type **Business**, name `orion-social`.
4. `npm run auth:instagram`: walks the token dance (short-lived user token from the Graph
   API Explorer with `pages_show_list, instagram_basic, instagram_content_publish,
   pages_read_engagement, business_management`; exchanges it long-lived; resolves the Page
   token and `IG_USER_ID` via `/me/accounts?fields=instagram_business_account`). Stores
   `IG_USER_ID` + `IG_ACCESS_TOKEN` in `.env`. The app stays in Dev Mode: that is fine
   forever, because Dev Mode works fully for accounts with a role on the app, and that is
   you.

### TikTok

Nothing to set up in v1.
