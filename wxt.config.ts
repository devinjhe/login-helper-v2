import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";
import { createHash } from "node:crypto";

/**
 * WXT config — generates the MV3 manifest from entrypoints under `src/entrypoints/`.
 *
 * The `key` field pins the extension ID. Chrome derives the 32-char extension ID from
 * this base64 RSA public key, so the OAuth client ID stays valid across reloads of the
 * unpacked extension. EXTENSION_KEY is loaded from `.env.local`.
 */
export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: () => {
    const extensionKey = process.env.EXTENSION_KEY;
    const expectedId = process.env.EXTENSION_ID;
    const oauthClientId = process.env.GOOGLE_OAUTH_CLIENT_ID;

    if (!extensionKey) {
      throw new Error(
        "EXTENSION_KEY is missing from .env.local. See .env.example for the required fields.",
      );
    }
    if (!oauthClientId) {
      throw new Error(
        "GOOGLE_OAUTH_CLIENT_ID is missing from .env.local. See .env.example for the required fields.",
      );
    }

    if (expectedId) {
      const derived = deriveExtensionId(extensionKey);
      if (derived !== expectedId) {
        // Soft warning, not throw: M1/M2 don't need OAuth, but M3's manual smoke
        // test will fail unless the user fixes .env.local before then.
        console.warn(
          `[wxt.config] EXTENSION_ID mismatch — Chrome will load the extension as "${derived}", ` +
            `but .env.local records EXTENSION_ID="${expectedId}". The OAuth client must be ` +
            `registered against the derived value, or sign-in will fail.`,
        );
      }
    }

    return {
      name: "Login Helper v2",
      description:
        "Remembers which login method you use on each website (Google, Email, Username, etc.)",
      key: extensionKey,
      // `tabs` covers reading the active tab's URL via chrome.tabs.query; no
      // host_permissions needed since we never inject scripts or fetch page
      // content. Add a scoped content_scripts match if injection is ever required.
      permissions: ["identity", "storage", "tabs"],
      oauth2: {
        client_id: oauthClientId,
        scopes: [
          "https://www.googleapis.com/auth/userinfo.email",
          "https://www.googleapis.com/auth/userinfo.profile",
        ],
      },
    };
  },
});

/**
 * Replicates Chrome's extension ID derivation: SHA-256 of the DER-encoded public
 * key, take the first 32 hex chars, and remap each character via a → 0..9, k → a..f.
 */
function deriveExtensionId(base64PublicKey: string): string {
  const der = Buffer.from(base64PublicKey, "base64");
  const sha = createHash("sha256").update(der).digest("hex").slice(0, 32);
  let out = "";
  for (const c of sha) {
    const code = c.charCodeAt(0);
    if (code >= 0x30 && code <= 0x39) {
      out += String.fromCharCode(code + 49);
    } else if (code >= 0x61 && code <= 0x66) {
      out += String.fromCharCode(code + 10);
    } else {
      out += c;
    }
  }
  return out;
}
