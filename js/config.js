/* Meditation Copilot — configuration
 * Fill these in as accounts are set up. Client IDs are public identifiers, not secrets,
 * so they are safe to keep in this file (no passwords or keys ever go here).
 */
window.MC_CONFIG = {
  // Google Cloud > Google Auth Platform > Clients > "Meditation Copilot Web" > Client ID
  googleClientId: '',            // e.g. '1234567890-abc123.apps.googleusercontent.com'

  // Microsoft Entra > App registrations > Meditation Copilot > Application (client) ID
  microsoftClientId: '',         // e.g. '0a1b2c3d-....'

  // Anonymous usage statistics (cookie-free). Leave empty to turn off.
  // GoatCounter: 'https://YOURCODE.goatcounter.com/count'
  analyticsEndpoint: '',

  support: {
    email: 'MinneapolisCenter@sos.org',
    phone: '612-216-4444'
  },
  privacyPolicyUrl: 'privacy.html'
};
