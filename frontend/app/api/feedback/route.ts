import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

import {
  enforceRateLimit,
  getRateLimitSubject,
  rateLimitResponse,
} from '@/lib/security/rate-limit';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_FILES = 5;
const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-zA-Z0-9.-]{1,253}$/;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function POST(req: NextRequest) {
  const subject = getRateLimitSubject(req);
  const rl = await enforceRateLimit({
    key: `feedback:${subject}`,
    limit: 5,
    windowSeconds: 3600, // 5 submissions per IP per hour
  });
  if (!rl.ok)
    return rateLimitResponse({ retryAfterSeconds: rl.retryAfterSeconds });

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  const emailFrom = process.env.EMAIL_FROM;

  if (!gmailUser || !gmailPass || !emailFrom) {
    console.error('Feedback API: Missing email environment variables');
    return NextResponse.json({ success: false }, { status: 500 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ success: false }, { status: 400 });
  }

  const name = (formData.get('name') as string | null)?.trim();
  const email = (formData.get('email') as string | null)?.trim();
  const category = (formData.get('category') as string | null)?.trim();
  const message = (formData.get('message') as string | null)?.trim();

  if (!name || !email || !category || !message) {
    return NextResponse.json({ success: false }, { status: 400 });
  }

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ success: false }, { status: 400 });
  }

  // Strip CRLF and RFC 5322 specials from email before use in headers
  const safeEmail = email.replace(/[\r\n<>"]/g, '');

  const rawFiles = formData.getAll('attachment');
  const files = rawFiles.filter(
    (f): f is File => f instanceof File && f.size > 0
  );

  if (files.length > MAX_FILES) {
    return NextResponse.json({ success: false }, { status: 400 });
  }

  const attachments: {
    filename: string;
    content: Buffer;
    contentType: string;
  }[] = [];

  for (const f of files) {
    if (f.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, tooLarge: true },
        { status: 413 }
      );
    }
    const buffer = Buffer.from(await f.arrayBuffer());
    attachments.push({
      filename: f.name,
      content: buffer,
      contentType: f.type,
    });
  }

  const mailer = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: gmailUser, pass: gmailPass },
  });

  // Sanitize name for use in email header (strip CR/LF and RFC 5322 specials)
  const safeNameForHeader = name.replace(/[\r\n"<>\\]/g, '');

  try {
    await mailer.sendMail({
      from: emailFrom,
      replyTo: safeNameForHeader
        ? `"${safeNameForHeader}" <${safeEmail}>`
        : safeEmail,
      to: emailFrom,
      subject: `DevLovers Feedback: ${category.replace(/[\r\n]/g, '')}`,
      html: `
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Category:</strong> ${escapeHtml(category)}</p>
        <p><strong>Message:</strong></p>
        <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
      `,
      attachments,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Feedback API: Failed to send email', err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
