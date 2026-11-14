import nodemailer, { type Transporter } from 'nodemailer'
import { env } from '../config/env'
import { logger } from '../lib/logger'

export interface Mail {
  to: string
  subject: string
  heading: string
  body: string
  /** Label/value pairs shown as a table, e.g. bank transfer details. */
  details?: [label: string, value: string][]
  action?: { label: string; url: string }
}

export const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

/** Every dynamic value is escaped: listing titles and nicknames are user input. */
export function renderMail(mail: Mail): string {
  const action = mail.action
    ? `<p style="margin:28px 0"><a href="${escapeHtml(mail.action.url)}" style="background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">${escapeHtml(mail.action.label)}</a></p>`
    : ''
  const details = mail.details?.length
    ? `<table style="margin:20px 0 0;border-collapse:collapse;width:100%">${mail.details
        .map(
          ([label, value]) =>
            `<tr><td style="padding:6px 12px 6px 0;color:#44605a">${escapeHtml(label)}</td><td style="padding:6px 0;font-weight:600">${escapeHtml(value)}</td></tr>`,
        )
        .join('')}</table>`
    : ''
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f4f6f5;font-family:Helvetica,Arial,sans-serif;color:#10231f">
    <div style="max-width:520px;margin:32px auto;background:#ffffff;border:1px solid #dfe7e4;border-radius:12px;padding:32px">
      <h1 style="margin:0 0 12px;font-size:22px">${escapeHtml(mail.heading)}</h1>
      <p style="margin:0;line-height:1.6;color:#44605a">${escapeHtml(mail.body)}</p>
      ${details}
      ${action}
    </div>
  </body>
</html>`
}

let transporter: Transporter | null = null

function getTransporter(): Transporter | null {
  if (!env.SMTP_HOST) return null
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  })
  return transporter
}

/** "Marketplace <no-reply@example.com>" -> name and address. */
export function parseSender(from: string): { name: string; email: string } {
  const match = /^(.*)<([^>]+)>\s*$/.exec(from)
  const name = match?.[1]?.trim().replace(/^"|"$/g, '')
  return { name: name || 'Marketplace', email: (match?.[2] ?? from).trim() }
}

const textOf = (mail: Mail) =>
  [mail.heading, mail.body, ...(mail.details ?? []).map(([label, value]) => `${label}: ${value}`), mail.action?.url]
    .filter(Boolean)
    .join('\n\n')

/**
 * Many hosts (Render's free plan among them) block outgoing SMTP ports, so
 * the message is handed to the provider with an ordinary HTTPS request.
 */
async function sendViaBrevo(apiKey: string, mail: Mail): Promise<void> {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: parseSender(env.MAIL_FROM),
      to: [{ email: mail.to }],
      subject: mail.subject,
      htmlContent: renderMail(mail),
      textContent: textOf(mail),
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) {
    throw new Error(`E-mail provider answered ${response.status}: ${(await response.text()).slice(0, 300)}`)
  }
}

export const mailer = {
  /** Without SMTP settings the message is logged, which keeps local development self-contained. */
  async send(mail: Mail): Promise<void> {
    if (env.BREVO_API_KEY) {
      await sendViaBrevo(env.BREVO_API_KEY, mail)
      return
    }
    const transport = getTransporter()
    if (!transport) {
      logger.info({ to: mail.to, subject: mail.subject, action: mail.action?.url }, 'E-mail not sent (SMTP is not configured)')
      return
    }
    await transport.sendMail({
      from: env.MAIL_FROM,
      to: mail.to,
      subject: mail.subject,
      html: renderMail(mail),
      text: textOf(mail),
    })
  },
}
