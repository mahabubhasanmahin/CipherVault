/**
 * CipherVault — config.js
 *
 * The frontend here (Netlify) is a STATIC site only — it cannot run the
 * Flask backend. Every signup/login/vault request goes to whatever URL
 * is set below. Leaving this at localhost is why registration/login
 * silently fails once the site is deployed: the request never leaves
 * the visitor's browser to reach a real server.
 *
 * Deploy the backend (Render/Railway — see README) first, then paste
 * its live URL here, e.g.:
 *   window.CIPHERVAULT_API_BASE = "https://ciphervault-api.onrender.com/api";
 */
window.CIPHERVAULT_API_BASE = window.CIPHERVAULT_API_BASE || "http://localhost:5000/api";
