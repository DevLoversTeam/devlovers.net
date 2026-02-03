import nodemailer from 'nodemailer';

const user = process.env.GMAIL_USER;
const pass = process.env.GMAIL_APP_PASSWORD;

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
