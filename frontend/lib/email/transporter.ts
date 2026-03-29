import nodemailer from 'nodemailer';

import { readServerEnv } from '@/lib/env/server-env';

const user = readServerEnv('GMAIL_USER');
const pass = readServerEnv('GMAIL_APP_PASSWORD');

if (!user || !pass) {
  throw new Error('Missing Gmail SMTP credentials');
}

export const mailer = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user,
    pass,
  },
});
