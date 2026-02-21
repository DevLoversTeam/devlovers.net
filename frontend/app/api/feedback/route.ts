import nodemailer from 'nodemailer';
import { NextRequest, NextResponse } from 'next/server';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export async function POST(req: NextRequest) {
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

  const rawFiles = formData.getAll('attachment');
  const files = rawFiles.filter((f): f is File => f instanceof File && f.size > 0);

  const attachments: { filename: string; content: Buffer; contentType: string }[] = [];

  for (const f of files) {
    if (f.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, tooLarge: true }, { status: 413 });
    }
    const buffer = Buffer.from(await f.arrayBuffer());
    attachments.push({ filename: f.name, content: buffer, contentType: f.type });
  }

  const mailer = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: gmailUser, pass: gmailPass },
  });

  try {
    await mailer.sendMail({
      from: emailFrom,
      replyTo: `"${name}" <${email}>`,
      to: emailFrom,
      subject: `DevLovers Feedback: ${category}`,
      html: `
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Category:</strong> ${category}</p>
        <p><strong>Message:</strong></p>
        <p>${message.replace(/\n/g, '<br>')}</p>
      `,
      attachments,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Feedback API: Failed to send email', err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
