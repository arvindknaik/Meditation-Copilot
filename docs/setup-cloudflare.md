# Set up the events server (Cloudflare)

This puts the SOS events server (`api/` folder) online so the app can show events, take RSVPs and record check-ins. It takes about 20 minutes, and the pilot should fit within Cloudflare's **free plan** (Workers: 100,000 requests a day; D1: 5 GB).

> **Account:** use an SOS-owned email if you can (for example a shared @sos.org address), so the service isn't tied to one person. You can add other members to the Cloudflare account later.

## 1. One-time installs
1. Create a free account at https://dash.cloudflare.com/sign-up and verify your email.
2. Install **Node.js LTS** from https://nodejs.org (accept the defaults). Then open a new Command Prompt and check that `node -v` prints a version.

## 2. Install and log in
In Command Prompt:
```
cd "C:\Users\arvin\OneDrive - Science of Spirituality, Inc\Apps\Meditation-Copilot\api"
npm install
npx wrangler login
```
A browser window opens. Click **Allow**.

## 3. Create the database
```
npx wrangler d1 create meditation-copilot
```
1. Copy the `database_id` value that this prints.
2. Open `api\wrangler.toml` and replace `REPLACE_WITH_ID_FROM_wrangler_d1_create` with it.
3. Create the tables:
```
npm run db:remote
```
If it asks "Ok to proceed?", answer `y`.

## 4. Set the secrets (never put these in files)
```
npx wrangler secret put SESSION_SECRET
```
When it asks, paste a long random string, at least 40 characters. One way to make one: run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
```
npx wrangler secret put ADMIN_EMAILS
```
When it asks, enter the email you sign in to the app with. For more than one admin, separate the emails with commas.

**Never** set `DEV_LOGIN` on the live server. It exists only for local testing.

## 5. Deploy
```
npm run deploy
```
The output ends with a URL such as `https://meditation-copilot-api.<your-subdomain>.workers.dev`.
- Test it: opening `<that URL>/api/health` should show `{"ok":true,...}`.

## 6. Connect the app
1. In `js\config.js`, set `apiBase: 'https://meditation-copilot-api.<your-subdomain>.workers.dev'` (with no trailing slash).
2. Run `push.bat`.
3. After GitHub Pages updates (1–2 minutes), open the app and sign in with your admin email.
4. Go to **Calendar → SOS events → + New event**.

## 7. Try it end to end
1. Create an in-person event that starts in the next 30 minutes.
2. On a second phone, or in a private window, sign in with another account. Then RSVP **Going**.
3. On the event page, scan the door QR shown under **Host tools**, or type the 4-digit code. The phone should show "You're checked in" and +50 points.
4. Under **Attendees**, the person should show up. **CSV** downloads the list.

## Updating after a new version
When a release adds a file under `api/migrations/` (for example `0005_feedback.sql` in v0.14.0), run these in the `api` folder before pushing the app:
```
npm run db:remote
npm run deploy
```
`db:remote` applies only the migrations that haven't run yet. The first time, it also records `0001_init.sql`, which is harmless because those tables already exist.

## Later
- **Custom domain (sosmn.org):** add the new site address (for example `https://app.sosmn.org`) to `ALLOWED_ORIGINS` in `wrangler.toml`, then run `npm run deploy` again.
- **Logs:** Cloudflare dashboard → Workers & Pages → meditation-copilot-api → Logs.
- **Backup:** `npx wrangler d1 export meditation-copilot --remote --output=backup.sql`
- **Moving to Azure:** the server uses plain JavaScript and standard SQL. `backup.sql` can be loaded into Azure SQL or PostgreSQL, and the request handlers can be ported to Azure Functions.

## Local testing (optional)
1. Create `api\.dev.vars` (it is git-ignored) with these lines:
   ```
   SESSION_SECRET=local-dev-secret
   ADMIN_EMAILS=admin@example.com
   DEV_LOGIN=true
   ALLOWED_ORIGINS=http://localhost:8000
   ```
2. Set up the local database and start the server:
   ```
   npm run db:local
   npm run dev
   ```
3. Run `server-start.bat` in the main folder.
4. In the browser console, run `localStorage.setItem('meditation-copilot:api-override', '"http://localhost:8787"')`.
