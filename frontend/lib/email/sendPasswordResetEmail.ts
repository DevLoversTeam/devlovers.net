import { readServerEnv } from '@/lib/env/server-env';

import { resetPasswordTemplate } from './templates/reset-password';
import { mailer } from './transporter';

type Params = {
  to: string;
  resetUrl: string;
};

export async function sendPasswordResetEmail({ to, resetUrl }: Params) {
  const from = readServerEnv('EMAIL_FROM');

  if (!from) {
    throw new Error('EMAIL_FROM is not configured');
  }

  await mailer.sendMail({
    from,
    to,
    subject: 'DevLovers - Reset your password',
    text: `Reset your password: ${resetUrl}`,
    html: resetPasswordTemplate(resetUrl),
  });
}
