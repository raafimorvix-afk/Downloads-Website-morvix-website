import "server-only";
import nodemailer from "nodemailer";

/**
 * Hostinger mailboxes. The password for each sending address lives in an environment variable named
 * after the part before the @, e.g. sales@wearemorvix.com -> SMTP_PASS_SALES, info@ -> SMTP_PASS_INFO.
 * Passwords are never stored in the database or the code.
 */
export function smtpPasswordFor(fromEmail: string) {
  const key = "SMTP_PASS_" + fromEmail.split("@")[0].toUpperCase().replace(/[^A-Z0-9]/g, "_");
  return { key, value: process.env[key] };
}

export type MailAttachment = { filename: string; content: Buffer; contentType?: string };

export async function sendMail(opts: {
  from: string; fromName?: string; to: string[]; cc?: string[]; subject: string; text: string; attachments?: MailAttachment[];
}) {
  const { key, value: pass } = smtpPasswordFor(opts.from);
  if (!pass) throw new Error(`Email is not set up yet for ${opts.from} (missing ${key}).`);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.hostinger.com",
    port: Number(process.env.SMTP_PORT || 465),
    secure: true,
    auth: { user: opts.from, pass },
  });
  await transport.sendMail({
    from: { name: opts.fromName || process.env.MAIL_FROM_NAME || "Morvix LLC", address: opts.from },
    to: opts.to, cc: opts.cc?.length ? opts.cc : undefined,
    subject: opts.subject, text: opts.text, attachments: opts.attachments,
  });
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** "6th of November (Friday), at 11:00 AM" in the appointment's own time zone */
export function longAppt(iso: string | null, tz: string | null) {
  if (!iso) return "To be confirmed";
  const zone = tz || "America/New_York";
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: zone, day: "numeric", month: "long", weekday: "long", hour: "numeric", minute: "2-digit",
  }).formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${ordinal(Number(parts.day))} of ${parts.month} (${parts.weekday}), at ${parts.hour}:${parts.minute} ${parts.dayPeriod}`;
}

export function shortAppt(iso: string | null, tz: string | null) {
  if (!iso) return "TBC";
  return new Intl.DateTimeFormat("en-US", { timeZone: tz || "America/New_York", month: "short", day: "numeric" }).format(new Date(iso));
}

/** Fills {{placeholders}}. Unknown or empty values become "N/A" so the client never sees raw braces. */
export function fillTemplate(tpl: string, values: Record<string, string | null | undefined>) {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => {
    const v = values[k];
    return v && String(v).trim() ? String(v).trim() : "N/A";
  });
}

export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || "https://morvix-crm.vercel.app").replace(/\/$/, "");

/** Sender for invites and digests: the shift's mailbox if known, otherwise info@. */
export const systemFrom = (shiftFrom?: string | null) => shiftFrom || process.env.SYSTEM_FROM_EMAIL || "info@wearemorvix.com";
