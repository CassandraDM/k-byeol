// Generates the "Apple client secret" JWT that Supabase's Apple provider needs.
//
// Usage:
//   node scripts/generate-apple-secret.mjs <teamId> <keyId> <serviceId> <path-to-.p8>
//
// Example:
//   node scripts/generate-apple-secret.mjs <teamId> <keyId> <serviceId> ~/Downloads/AuthKey_<keyId>.p8
//
// Paste the printed token into Supabase → Auth → Providers → Apple → "Secret Key (for OAuth)".
// Apple caps the lifetime at 6 months — regenerate before it expires.

import { readFileSync } from "node:fs";
import { createPrivateKey, sign } from "node:crypto";

const [teamId, keyId, serviceId, p8Path] = process.argv.slice(2);

if (!teamId || !keyId || !serviceId || !p8Path) {
  console.error(
    "Usage: node scripts/generate-apple-secret.mjs <teamId> <keyId> <serviceId> <path-to-.p8>",
  );
  process.exit(1);
}

const b64url = (input) =>
  Buffer.from(input).toString("base64url");

const now = Math.floor(Date.now() / 1000);
const sixMonths = 60 * 60 * 24 * 180; // Apple's maximum

const header = { alg: "ES256", kid: keyId };
const payload = {
  iss: teamId,
  iat: now,
  exp: now + sixMonths,
  aud: "https://appleid.apple.com",
  sub: serviceId, // the Services ID used for web sign-in
};

const signingInput = `${b64url(JSON.stringify(header))}.${b64url(
  JSON.stringify(payload),
)}`;

const privateKey = createPrivateKey(readFileSync(p8Path));
const signature = sign("sha256", Buffer.from(signingInput), {
  key: privateKey,
  dsaEncoding: "ieee-p1363", // JOSE-style raw R||S signature (required for ES256)
});

const jwt = `${signingInput}.${signature.toString("base64url")}`;

console.log("\nApple client secret (valid ~6 months) — paste this into Supabase:\n");
console.log(jwt);
console.log("");
