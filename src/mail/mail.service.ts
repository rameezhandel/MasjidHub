import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { Env } from '../config/env';

/**
 * Provider-agnostic mailer over SMTP (works with SES, Resend, Postmark, …).
 * When SMTP_URL is not configured, emails are logged instead of sent — fine
 * for development, loudly flagged in production.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor(private readonly configService: ConfigService<Env, true>) {
    const smtpUrl = this.configService.get('SMTP_URL', { infer: true });
    this.from = this.configService.get('MAIL_FROM', { infer: true });
    this.transporter = smtpUrl ? createTransport(smtpUrl) : null;
    if (!this.transporter && this.configService.get('NODE_ENV', { infer: true }) === 'production') {
      this.logger.error('SMTP_URL is not configured — outgoing email is DISABLED in production');
    }
  }

  async sendPasswordResetEmail(to: string, resetUrl: string, ttlMinutes: number): Promise<void> {
    const subject = 'Reset your MasjidHub password';
    const text = [
      'As-salamu alaykum,',
      '',
      'A password reset was requested for your MasjidHub account.',
      `Open this link to choose a new password (valid for ${ttlMinutes} minutes):`,
      '',
      resetUrl,
      '',
      'If you did not request this, you can safely ignore this email — your password is unchanged.',
    ].join('\n');
    const html = `
      <p>As-salamu alaykum,</p>
      <p>A password reset was requested for your MasjidHub account.</p>
      <p><a href="${resetUrl}">Choose a new password</a> (valid for ${ttlMinutes} minutes).</p>
      <p>If you did not request this, you can safely ignore this email — your password is unchanged.</p>
    `;
    await this.send(to, subject, text, html);
  }

  private async send(to: string, subject: string, text: string, html: string): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(`SMTP not configured — email suppressed. To: ${to} | ${subject}\n${text}`);
      return;
    }
    await this.transporter.sendMail({ from: this.from, to, subject, text, html });
  }
}
