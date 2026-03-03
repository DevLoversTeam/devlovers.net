import 'server-only';

import nodemailer, { type Transporter } from 'nodemailer';

export type ShopNotificationEmailArgs = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type ShopNotificationEmailResult = {
  messageId: string | null;
};

export class ShopNotificationTransportError extends Error {
  readonly code: string;
  readonly transient: boolean;

  constructor(code: string, message: string, transient: boolean) {
    super(message);
    this.name = 'ShopNotificationTransportError';
    this.code = code;
    this.transient = transient;
  }
}

type TransportConfig = {
  from: string;
  gmailUser: string;
  gmailAppPassword: string;
};

let cachedTransport: Transporter | null = null;
let cachedTransportKey: string | null = null;

function trimOrNull(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readTransportConfig(): TransportConfig {
  const from = trimOrNull(process.env.EMAIL_FROM);
  const gmailUser = trimOrNull(process.env.GMAIL_USER);
  const gmailAppPassword = trimOrNull(process.env.GMAIL_APP_PASSWORD);

  if (!from || !gmailUser || !gmailAppPassword) {
    throw new ShopNotificationTransportError(
      'NOTIFICATION_TRANSPORT_MISCONFIG',
      'Email transport is not configured (EMAIL_FROM/GMAIL_USER/GMAIL_APP_PASSWORD required).',
      false
    );
  }

  return {
    from,
    gmailUser,
    gmailAppPassword,
  };
}

function getTransport(config: TransportConfig): Transporter {
  const key = `${config.gmailUser}|${config.from}`;
  if (cachedTransport && cachedTransportKey === key) {
    return cachedTransport;
  }

  cachedTransport = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: config.gmailUser,
      pass: config.gmailAppPassword,
    },
  });
  cachedTransportKey = key;

  return cachedTransport;
}

function classifySendFailure(error: unknown): ShopNotificationTransportError {
  if (error instanceof ShopNotificationTransportError) return error;

  const err = error as {
    code?: unknown;
    responseCode?: unknown;
    message?: unknown;
  };

  const codeRaw =
    typeof err?.code === 'string' && err.code.trim().length > 0
      ? err.code.trim().toUpperCase()
      : 'NOTIFICATION_TRANSPORT_SEND_FAILED';

  const responseCode =
    typeof err?.responseCode === 'number' && Number.isFinite(err.responseCode)
      ? err.responseCode
      : null;

  const message =
    error instanceof Error && error.message.trim().length > 0
      ? error.message.trim()
      : 'Notification transport send failed.';

  const transientCodes = new Set(['ECONNECTION', 'ETIMEDOUT', 'EAI_AGAIN']);
  const permanentCodes = new Set([
    'EAUTH',
    'EENVELOPE',
    'EMESSAGE',
    'ESOCKET',
    'NOTIFICATION_TRANSPORT_MISCONFIG',
  ]);

  let transient: boolean;
  if (transientCodes.has(codeRaw)) {
    transient = true;
  } else if (permanentCodes.has(codeRaw)) {
    transient = false;
  } else if (responseCode !== null) {
    if (responseCode >= 400 && responseCode < 500) transient = true;
    else transient = false;
  } else {
    transient = true;
  }

  return new ShopNotificationTransportError(codeRaw, message, transient);
}

export async function sendShopNotificationEmail(
  args: ShopNotificationEmailArgs
): Promise<ShopNotificationEmailResult> {
  const config = readTransportConfig();
  const transport = getTransport(config);

  try {
    const info = await transport.sendMail({
      from: config.from,
      to: args.to,
      subject: args.subject,
      text: args.text,
      html: args.html,
    });

    return {
      messageId: typeof info?.messageId === 'string' ? info.messageId : null,
    };
  } catch (error) {
    throw classifySendFailure(error);
  }
}
