/*
 * Copyright (c) Emil John Benitez, 2026. All rights reserved. This computer
 * program is protected by copyright laws  and international treaties, and it
 * or any part thereof, may not be copied,  reproduced, utilized, distributed
 * or an adaptation thereof be made,  without the prior authority and consent
 * of PharmaServ Express.  Any unauthorized use of this program will be dealt
 * with and  prosecuted to the maximum extent possible under  the law and may
 * result in civil and criminal liabilities.
 */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly transport?: Transporter;

  constructor(private readonly config: ConfigService) {
    const host = config.get<string>('SMTP_HOST');
    if (host) {
      this.transport = nodemailer.createTransport({
        host,
        port: config.get<number>('SMTP_PORT', 587),
        secure: config.get<string>('SMTP_SECURE', 'false') === 'true',
        auth: {
          user: config.get<string>('SMTP_USER'),
          pass: config.get<string>('SMTP_PASSWORD'),
        },
      });
    }
  }

  private escapeHtml(value: string) {
    return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!);
  }

  async sendTemporaryPassword(input: { name: string; email: string; schoolName: string; temporaryPassword: string; role: string }) {
    const portalUrl = this.config.get<string>('ADMIN_WEB_URL', 'http://localhost:5173');
    const roleName = input.role === 'SCHOOL_ADMIN' ? 'School Administrator' : 'Teacher';
    const subject = `Welcome to E-Guro — ${input.schoolName}`;
    const text = [
      `Hello ${input.name},`, '',
      `Your ${roleName} account for ${input.schoolName} is ready.`, '',
      `Login email: ${input.email}`,
      `Temporary password: ${input.temporaryPassword}`, '',
      `Open the E-Guro portal: ${portalUrl}`, '',
      'For your security, sign in and change this temporary password immediately. Do not forward or share this email.', '',
      'E-Guro School Management',
    ].join('\n');
    const safeName = this.escapeHtml(input.name);
    const safeSchool = this.escapeHtml(input.schoolName);
    const safeRole = this.escapeHtml(roleName);
    const safeEmail = this.escapeHtml(input.email);
    const safePassword = this.escapeHtml(input.temporaryPassword);
    const safePortalUrl = this.escapeHtml(portalUrl);
    const html = `<!doctype html>
<html><body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#14213d">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;padding:32px 16px"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 10px 35px rgba(20,33,61,.10)">
      <tr><td style="padding:28px 34px;background:#1768e5;color:#ffffff"><div style="font-size:24px;font-weight:800">E-Guro</div><div style="margin-top:6px;color:#dceaff;font-size:13px">School Management Portal</div></td></tr>
      <tr><td style="padding:34px">
        <p style="margin:0 0 18px;font-size:17px">Hello <strong>${safeName}</strong>,</p>
        <p style="margin:0 0 22px;line-height:1.6;color:#526079">Your <strong>${safeRole}</strong> account for <strong>${safeSchool}</strong> is ready.</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f8fd;border:1px solid #e2e9f4;border-radius:12px;padding:18px">
          <tr><td style="padding:5px 0;color:#718096;font-size:12px">SCHOOL</td><td style="padding:5px 0;text-align:right;font-weight:700">${safeSchool}</td></tr>
          <tr><td style="padding:5px 0;color:#718096;font-size:12px">LOGIN EMAIL</td><td style="padding:5px 0;text-align:right;font-weight:700">${safeEmail}</td></tr>
          <tr><td style="padding:5px 0;color:#718096;font-size:12px">TEMPORARY PASSWORD</td><td style="padding:5px 0;text-align:right;font:700 14px monospace">${safePassword}</td></tr>
        </table>
        <div style="text-align:center;margin:28px 0"><a href="${safePortalUrl}" style="display:inline-block;padding:13px 24px;border-radius:10px;background:#1768e5;color:#ffffff;text-decoration:none;font-weight:700">Sign in to E-Guro</a></div>
        <p style="margin:0;padding:14px;border-radius:10px;background:#fff7e6;color:#8a5a00;font-size:12px;line-height:1.55"><strong>Security reminder:</strong> Change this temporary password immediately after signing in. Do not forward or share this email.</p>
      </td></tr>
      <tr><td style="padding:18px 34px;border-top:1px solid #edf1f6;color:#8a96a8;font-size:11px">This account was created for ${safeSchool}. If you were not expecting it, contact your school administrator.</td></tr>
    </table>
  </td></tr></table>
</body></html>`;
    if (!this.transport) {
      console.log(`\n[DEV EMAIL]\nTo: ${input.email}\nSubject: ${subject}\n${text}\n`);
      return false;
    }
    const from = this.config.get<string>('SMTP_FROM');
    if (!from || /@example\.com\b/i.test(from)) {
      throw new Error('SMTP_FROM must be an email address verified by your SMTP provider; example.com is only a placeholder');
    }
    await this.transport.sendMail({ from, to: input.email, subject, text, html });
    return true;
  }
}
