import 'dotenv/config';
import { MailService } from '../src/mail/mail.service';

/**
 * Sends a test password-reset email using the current .env configuration.
 *
 * Usage:
 *   npx tsx scripts/test-reset-email.ts destinataire@email.com
 *
 * Behaviour depends on .env:
 *   - RESEND_API_KEY set  -> sends via Resend
 *   - SMTP_* set          -> sends via SMTP
 *   - neither             -> logs the email to the console (dev fallback)
 */
async function main() {
  const to = process.argv[2];
  if (!to) {
    console.error('Usage: npx tsx scripts/test-reset-email.ts <destinataire@email.com>');
    process.exit(1);
  }

  const mail = new MailService();
  // A sample 6-digit code, matching the real reset-code format.
  const fakeToken = '042317';

  console.log(`Sending test password-reset email to ${to} ...`);
  // Same TTL as the real flow (RESET_TOKEN_TTL_MINUTES in auth.service.ts).
  await mail.sendPasswordReset(to, fakeToken, 5);
  console.log('Done. Check the inbox (and the spam folder).');
}

main().catch((e) => {
  console.error('Test failed:', e);
  process.exit(1);
});
