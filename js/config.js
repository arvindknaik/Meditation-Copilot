/* Meditation Copilot — configuration
 * Fill these in as accounts are set up. Client IDs are public identifiers, not secrets,
 * so they are safe to keep in this file (no passwords or keys ever go here).
 */
window.MC_CONFIG = {
  // Google Cloud > Google Auth Platform > Clients > "Meditation Copilot Web" > Client ID
  googleClientId: '108186102394-sv306m8272h9p5eo4r5fvtolfgut3b09.apps.googleusercontent.com',

  // Microsoft Entra > App registrations > Meditation Copilot > Application (client) ID
  microsoftClientId: 'cc706be3-4021-4460-9705-95d4cd0c00d0',

  // Anonymous usage statistics (cookie-free). Leave empty to turn off.
  // GoatCounter: 'https://YOURCODE.goatcounter.com/count'
  analyticsEndpoint: 'https://meditation-copilot.goatcounter.com/count',

  // Events server (Cloudflare Worker). Fill in after deploying: docs/setup-cloudflare.md
  // e.g. 'https://meditation-copilot-api.YOUR-SUBDOMAIN.workers.dev'
  apiBase: 'https://meditation-copilot-api.aknaik.workers.dev',

  support: {
    email: 'MinneapolisCenter@sos.org',
    phone: '612-216-4444'
  },
  privacyPolicyUrl: 'privacy.html'
};
