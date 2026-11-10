# Meditation Copilot — Setting up Google and Microsoft sign-in

> **Who does this:** the product owner (Arvind). **Time:** about 15 minutes each. **Cost:** free.
> **Result:** two public **Client IDs** to paste into `js/config.js`. They are identifiers, not passwords.
> Screen names change from time to time; if a label differs slightly, look for the closest match.

## Which account to use

| Option | Good for | Watch out for |
|---|---|---|
| **Personal Google / Microsoft account** (recommended for the pilot) | Fast; no one else's approval needed | Your account's email appears as the "support email" on Google's consent screen (test users only) |
| @sos.org account | Organization ownership | SOS uses Microsoft 365, so an @sos.org Microsoft account is a **work** account; registering apps in the SOS directory needs SOS IT. It should wait until SOS approves the project |
| New @sosmn.org mailbox | Separate identity tied to the future domain | Another inbox to watch. Use **email forwarding** to your main inbox instead, once the domain is active |

**Recommended:** use your **personal accounts for the pilot**, and add a second owner later.
- **Google Cloud projects** can have more owners added, or be moved into an organization, later.
- **Microsoft registrations** can't be moved between directories. If SOS adopts the app, re-register in SOS's directory (5 minutes) and swap the Client ID in `js/config.js`.

---

## Part A — Google (needed for Google sign-in and Google Drive)

1. Go to **https://console.cloud.google.com** and sign in.
2. **Create a project:** click the project picker at the top, then **New project**.
   - Name: `Meditation Copilot`, then **Create**, and select the new project.
3. **Turn on the Drive API:** menu ☰ → **APIs & Services** → **Library**, search **Google Drive API**, then **Enable**.
4. **Set up the consent screen:** menu ☰ → **Google Auth Platform** (older UI: *APIs & Services → OAuth consent screen*), then **Get started**.
   - **App name:** `Meditation Copilot`
   - **User support email:** your email
   - **Audience:** **External**
   - **Contact email:** your email, then agree and **Create**.
5. **Branding** (left menu):
   - **App home page:** `https://arvindknaik.github.io/Meditation-Copilot/`
   - **Privacy policy:** `https://arvindknaik.github.io/Meditation-Copilot/privacy.html`
   - **Authorized domains:** `arvindknaik.github.io`
   - Skip the logo for now (a logo triggers Google's review), then **Save**.
6. **Audience** (left menu):
   - Leave **Publishing status: Testing**.
   - Under **Test users**, add the Google emails of the pilot users (up to 100), yourself included.
7. **Data Access** (left menu):
   - **Add or remove scopes**, then tick `openid`, `.../auth/userinfo.email` and `.../auth/drive.appdata` (described as *"See, create, and delete its own configuration data in your Google Drive"*).
   - Click **Update**, then **Save**.
8. **Clients** (left menu):
   - **Create client** → Application type **Web application** → Name `Meditation Copilot Web`.
   - **Authorized JavaScript origins:** add `https://arvindknaik.github.io` and `http://localhost:8000`.
   - Leave **Authorized redirect URIs** empty, then **Create**.
9. **Copy the Client ID.** It ends with `.apps.googleusercontent.com`. Send it to me, or paste it into `js/config.js` as `googleClientId`.

Do **not** create or share a *client secret*. A web app doesn't use one.

---

## Part B — Microsoft (needed for Microsoft sign-in and OneDrive)

Microsoft requires app registrations to live in a directory (an "Entra tenant"). A personal Microsoft account gets one through a free Azure account.

1. **Get a directory (one time):** go to **https://azure.microsoft.com/free** and sign up with your **personal** Microsoft account (Outlook/Hotmail/Live).
   - Microsoft asks for a card to verify identity. App registrations are free, and nothing here is billed.
   - If you already have an Azure account, skip this step.
2. Go to **https://entra.microsoft.com** and sign in with the same account.
3. Menu: **Entra ID** (or *Identity*) → **App registrations** → **New registration**.
   - **Name:** `Meditation Copilot`
   - **Supported account types:** **Personal Microsoft accounts only**
   - **Redirect URI:** platform **Single-page application (SPA)**, value `https://arvindknaik.github.io/Meditation-Copilot/`
   - Click **Register**.
4. **Authentication** (left menu):
   - Under *Single-page application*, **Add URI** `http://localhost:8000/` for local testing.
   - Make sure **Access tokens** and **ID tokens** (implicit grant) are **unticked**, then **Save**.
5. **API permissions** (left menu): **Add a permission** → **Microsoft Graph** → **Delegated permissions**.
   - Tick `Files.ReadWrite.AppFolder`, `User.Read`, `offline_access`, `openid`, then **Add permissions**.
   - No admin consent is needed for personal accounts.
6. **Branding & properties** (left menu):
   - **Home page URL:** `https://arvindknaik.github.io/Meditation-Copilot/`
   - **Privacy statement URL:** `https://arvindknaik.github.io/Meditation-Copilot/privacy.html`
   - Click **Save**.
7. **Overview** (left menu): copy the **Application (client) ID** (looks like `0a1b2c3d-…`). Send it to me, or paste it into `js/config.js` as `microsoftClientId`.

Do **not** create a *client secret* or certificate. A web app doesn't use one.

---

## Part C — Anonymous usage statistics (optional, 5 minutes)
1. Sign up at **https://www.goatcounter.com** (free for non-commercial use) and choose a code, e.g. `mcopilot`.
2. In `js/config.js`, set `analyticsEndpoint: 'https://mcopilot.goatcounter.com/count'`.
3. Events (app opened, sitting saved, export, etc.) appear in the GoatCounter dashboard. No cookies, and no personal data.

---

## Part D — When moving to `sosmn.org` (later)
1. **Point the domain:** in the domain's DNS, add `CNAME copilot → arvindknaik.github.io`.
2. **Tell GitHub:** in the repo, **Settings → Pages → Custom domain**: `copilot.sosmn.org`, then tick **Enforce HTTPS**.
3. **Google:** add the origin `https://copilot.sosmn.org`, add `sosmn.org` to Authorized domains, and update the home page and privacy URLs.
4. **Microsoft:** add the SPA redirect URI `https://copilot.sosmn.org/` and update the branding URLs.
5. **Before public launch:** publish the Google app (**Audience → Publish app**) and complete Google's verification.

## Checklist
- [ ] Google project created, Drive API enabled
- [ ] Consent screen: branding, test users, `drive.appdata` scope
- [ ] Google Web client created → Client ID sent
- [ ] Azure account / directory ready
- [ ] Microsoft app registered (personal accounts, SPA redirect URIs) → Client ID sent
- [ ] (Optional) GoatCounter code
