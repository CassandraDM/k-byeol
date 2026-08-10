import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { Resend } from 'resend';

/**
 * Sends transactional emails.
 *
 * Delivery transport is chosen once, in this priority order:
 *   1. Resend  — when RESEND_API_KEY is set (recommended).
 *   2. SMTP    — when SMTP_HOST / SMTP_USER / SMTP_PASS are set (nodemailer).
 *   3. Console — otherwise: the email is logged so the flow stays testable
 *                locally without any provider credentials.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend | null = null;
  private readonly transporter: nodemailer.Transporter | null = null;
  private readonly from: string;

  constructor() {
    this.from = process.env.MAIL_FROM || 'K-별 <onboarding@resend.dev>';

    const resendKey = process.env.RESEND_API_KEY;
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (resendKey) {
      this.resend = new Resend(resendKey);
      this.logger.log('Email transport: Resend');
    } else if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true', // true for 465, false for 587
        auth: { user, pass },
      });
      this.logger.log('Email transport: SMTP');
    } else {
      this.logger.warn(
        'No email provider configured — emails will be logged to the console instead of sent.',
      );
    }
  }

  /**
   * Sends a password-reset email containing a deep link and the raw token.
   */
  async sendPasswordReset(
    to: string,
    resetToken: string,
    expiresInMinutes: number,
  ): Promise<void> {
    const base = process.env.APP_RESET_URL || 'mobile://reset-password';
    const link = `${base}?token=${resetToken}`;

    const subject = 'Reset your K-별 password';
    const text = [
      'Hi,',
      '',
      'We received a request to reset your K-별 password.',
      '',
      `Open the app using this link: ${link}`,
      '',
      'Or paste this code into the "Reset password" screen:',
      resetToken,
      '',
      `This code expires in ${expiresInMinutes} minutes. If you didn't request a`,
      "password reset, you can safely ignore this email — your password won't change.",
    ].join('\n');

    const html = `
      <div style="font-family: sans-serif; line-height: 1.5; color: #1a1a1a;">
        <h2 style="color: #CF7EF2;">Reset your K-별 password</h2>
        <p>We received a request to reset your password.</p>
        <p>
          <a href="${link}"
             style="display:inline-block;padding:12px 24px;background:#CF7EF2;color:#fff;
                    border-radius:20px;text-decoration:none;">Reset password</a>
        </p>
        <p>Or paste this code into the <strong>Reset password</strong> screen:</p>
        <p style="font-size:18px;font-weight:bold;letter-spacing:1px;word-break:break-all;">${resetToken}</p>
        <p style="color:#666;font-size:13px;">
          This code expires in ${expiresInMinutes} minutes. If you didn't request a
          password reset, you can safely ignore this email.
        </p>
      </div>`;

    // 1. Resend
    if (this.resend) {
      const { error } = await this.resend.emails.send({
        from: this.from,
        to,
        subject,
        text,
        html,
      });
      if (error) {
        this.logger.error(
          `Resend failed to send password reset to ${to}: ${error.message}`,
        );
        throw new Error('Failed to send password reset email');
      }
      this.logger.log(`Password reset email sent to ${to} via Resend`);
      return;
    }

    // 2. SMTP
    if (this.transporter) {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject,
        text,
        html,
      });
      this.logger.log(`Password reset email sent to ${to} via SMTP`);
      return;
    }

    // 3. Console fallback (local dev)
    this.logger.log(
      `[DEV] Password reset email for ${to}\n` +
        `  Link : ${link}\n` +
        `  Token: ${resetToken}\n` +
        `  Expires in ${expiresInMinutes} min`,
    );
  }
}
