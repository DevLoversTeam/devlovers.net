import nodemailer from 'nodemailer';
import { afterEach, expect, it, vi } from 'vitest';

import { sendShopNotificationEmail } from '@/lib/services/shop/notifications/transport';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it('composes shop notifications with the real Nodemailer transport without sending email', async () => {
  vi.stubEnv('EMAIL_FROM', 'shop@example.test');
  vi.stubEnv('GMAIL_USER', 'shop@example.test');
  vi.stubEnv('GMAIL_APP_PASSWORD', 'test-only-password');

  const stream = nodemailer.createTransport({ streamTransport: true, buffer: true });
  const sendMail = vi.spyOn(stream, 'sendMail');
  const createTransport = vi.spyOn(nodemailer, 'createTransport').mockReturnValueOnce(stream);
  const result = await sendShopNotificationEmail({
    to: 'buyer@example.test',
    subject: 'Order confirmation',
    text: 'Your order is ready.',
    html: '<p>Your order is ready.</p>',
  });

  expect(createTransport).toHaveBeenCalledWith({
    service: 'gmail',
    auth: { user: 'shop@example.test', pass: 'test-only-password' },
  });
  expect(result.messageId).toEqual(expect.any(String));
  const info = await sendMail.mock.results[0].value;
  expect(info.envelope).toEqual({
    from: 'shop@example.test', to: ['buyer@example.test'],
  });
  const message = info.message.toString();
  expect(message).toContain('Subject: Order confirmation');
  expect(message).toContain('Your order is ready.');
  expect(message).toContain('multipart/alternative');
});
