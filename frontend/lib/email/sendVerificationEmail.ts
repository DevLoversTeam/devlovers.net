import { verifyEmailTemplate } from './templates/verify-email';
import { mailer } from './transporter';

type Params = {
  to: string;
  verifyUrl: string;
};

export async function sendVerificationEmail({ to, verifyUrl }: Params) {
  const from = process.env.EMAIL_FROM;

  if (!from) {
    throw new Error('EMAIL_FROM is not configured');
  }

  await mailer.sendMail({
    from,
    to,
    subject: 'DevLovers - Verify your email address',
    text: `Verify your email address: ${verifyUrl}`,
    html: verifyEmailTemplate(verifyUrl),
  });
}
