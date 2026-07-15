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

  async sendInvitationEmail(
    to: string,
    inviteUrl: string,
    masjidName: string,
    ttlDays: number,
  ): Promise<void> {
    const subject = `You've been invited to join ${masjidName} on MasjidHub`;
    const text = [
      'As-salamu alaykum,',
      '',
      `You have been invited to help manage ${masjidName} on MasjidHub.`,
      `Open this link to choose your password and activate your account (valid for ${ttlDays} days):`,
      '',
      inviteUrl,
      '',
      'If you were not expecting this invitation, you can safely ignore this email.',
    ].join('\n');
    const html = `
      <p>As-salamu alaykum,</p>
      <p>You have been invited to help manage <strong>${masjidName}</strong> on MasjidHub.</p>
      <p><a href="${inviteUrl}">Choose your password and activate your account</a> (valid for ${ttlDays} days).</p>
      <p>If you were not expecting this invitation, you can safely ignore this email.</p>
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
