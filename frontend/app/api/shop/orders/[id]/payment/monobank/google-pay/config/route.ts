import crypto from 'node:crypto';

import { NextRequest } from 'next/server';

import { logError, logWarn } from '@/lib/logging';
import { guardBrowserSameOrigin } from '@/lib/security/origin';
import { authorizeOrderMutationAccess } from '@/lib/services/shop/order-access';
import { orderIdParamSchema } from '@/lib/validation/shop';

import {
  ensureMonobankPayableOrder,
  formatMinorToDecimalString,
  isMonobankGooglePayEnabled,
  noStoreJson,
  readOrderPaymentRow,
} from '../../_shared';

const ALLOWED_AUTH_METHODS = ['PAN_ONLY', 'CRYPTOGRAM_3DS'] as const;
const ALLOWED_CARD_NETWORKS = ['MASTERCARD', 'VISA'] as const;

function buildGooglePaySkeleton(args: {
  totalAmountMinor: number;
  gatewayMerchantId: string;
  merchantName: string;
}) {
  const baseCardMethod = {
    type: 'CARD' as const,
    parameters: {
      allowedAuthMethods: [...ALLOWED_AUTH_METHODS],
      allowedCardNetworks: [...ALLOWED_CARD_NETWORKS],
    },
  };

  return {
    paymentDataRequest: {
      apiVersion: 2,
      apiVersionMinor: 0,
      allowedPaymentMethods: [
        {
          ...baseCardMethod,
          tokenizationSpecification: {
            type: 'PAYMENT_GATEWAY' as const,
            parameters: {
              gateway: 'monobank',
              gatewayMerchantId: args.gatewayMerchantId,
            },
          },
        },
      ],
      merchantInfo: {
        merchantName: args.merchantName,
      },
      transactionInfo: {
        totalPriceStatus: 'FINAL' as const,
        totalPrice: formatMinorToDecimalString(args.totalAmountMinor),
        currencyCode: 'UAH',
      },
    },
    readinessHints: {
      isReadyToPayRequest: {
        apiVersion: 2,
        apiVersionMinor: 0,
        allowedPaymentMethods: [baseCardMethod],
      },
    },
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const requestId =
    request.headers.get('x-request-id')?.trim() || crypto.randomUUID();
  const baseMeta = {
    requestId,
    route: request.nextUrl.pathname,
    method: request.method,
  };

  const blocked = guardBrowserSameOrigin(request);
  if (blocked) return blocked;

  const parsedParams = orderIdParamSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return noStoreJson(
      { code: 'INVALID_ORDER_ID', message: 'Invalid order id.' },
      400
    );
  }

  const orderId = parsedParams.data.id;
  const statusToken = request.nextUrl.searchParams.get('statusToken');
  const auth = await authorizeOrderMutationAccess({
    orderId,
    statusToken,
    requiredScope: 'order_payment_init',
  });
  if (!auth.authorized) {
    return noStoreJson({ code: auth.code }, auth.status);
  }

  if (!isMonobankGooglePayEnabled()) {
    return noStoreJson(
      {
        code: 'MONOBANK_GPAY_DISABLED',
        message: 'Monobank Google Pay is disabled.',
      },
      409
    );
  }

  const order = await readOrderPaymentRow(orderId);
  if (!order) {
    return noStoreJson({ code: 'ORDER_NOT_FOUND' }, 404);
  }

  const guard = ensureMonobankPayableOrder({
    order,
    allowedMethods: ['monobank_google_pay'],
  });
  if (!guard.ok) {
    logWarn('monobank_google_pay_config_rejected', {
      ...baseMeta,
      orderId,
      code: guard.code,
    });
    return noStoreJson({ code: guard.code, message: guard.message }, guard.status);
  }

  const gatewayMerchantId = (
    process.env.MONO_GOOGLE_PAY_GATEWAY_MERCHANT_ID ?? ''
  ).trim();
  const merchantName = (process.env.MONO_GOOGLE_PAY_MERCHANT_NAME ?? '').trim();
  if (!gatewayMerchantId || !merchantName) {
    logError('monobank_google_pay_config_missing_env', null, {
      ...baseMeta,
      orderId,
      code: 'MONOBANK_GPAY_CONFIG_MISSING',
    });
    return noStoreJson(
      {
        code: 'MONOBANK_GPAY_CONFIG_MISSING',
        message: 'Monobank Google Pay configuration is missing.',
      },
      500
    );
  }

  return noStoreJson({
    success: true,
    orderId,
    ...buildGooglePaySkeleton({
      totalAmountMinor: order.totalAmountMinor,
      gatewayMerchantId,
      merchantName,
    }),
  });
}
