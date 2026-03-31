'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState, useTransition } from 'react';

type ShippingMethodCode = 'NP_WAREHOUSE' | 'NP_LOCKER' | 'NP_COURIER';

type Props = {
  orderId: string;
  csrfToken: string;
  initialShipping: {
    methodCode: ShippingMethodCode;
    cityRef: string;
    cityLabel: string | null;
    warehouseRef: string | null;
    warehouseLabel: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    recipientFullName: string;
    recipientPhone: string;
    recipientEmail: string | null;
    recipientComment: string | null;
  };
};

function normalizeErrorCode(error: unknown): string {
  if (error instanceof TypeError) return 'NETWORK_ERROR';
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return 'NETWORK_ERROR';
}

function mapError(code: string, t: (key: string) => string): string {
  switch (code) {
    case 'NETWORK_ERROR':
      return t('errors.network');
    case 'CSRF_MISSING':
    case 'CSRF_REJECTED':
    case 'ORIGIN_BLOCKED':
      return t('errors.security');
    case 'INVALID_PAYLOAD':
    case 'INVALID_SHIPPING_ADDRESS':
      return t('errors.invalid');
    case 'SHIPPING_EDIT_NOT_ALLOWED':
    case 'ORDER_NOT_SHIPPABLE':
    case 'SHIPPING_NOT_REQUIRED':
    case 'SHIPPING_PROVIDER_UNSUPPORTED':
      return t('errors.notAllowed');
    case 'ADMIN_API_DISABLED':
      return t('errors.adminDisabled');
    default:
      return t('errors.generic');
  }
}

function methodLabel(
  value: ShippingMethodCode,
  t: (key: string) => string
): string {
  switch (value) {
    case 'NP_WAREHOUSE':
      return t('shippingMethods.novaPoshtaWarehouse');
    case 'NP_LOCKER':
      return t('shippingMethods.novaPoshtaLocker');
    case 'NP_COURIER':
      return t('shippingMethods.novaPoshtaCourier');
  }
}

export function ShippingEditForm({
  orderId,
  csrfToken,
  initialShipping,
}: Props) {
  const router = useRouter();
  const t = useTranslations('shop.orders.detail');
  const tEditor = useTranslations('shop.orders.detail.shippingEditor');
  const [isPending, startTransition] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [methodCode, setMethodCode] = useState<ShippingMethodCode>(
    initialShipping.methodCode
  );
  const [cityRef, setCityRef] = useState(initialShipping.cityRef);
  const [warehouseRef, setWarehouseRef] = useState(
    initialShipping.warehouseRef ?? ''
  );
  const [addressLine1, setAddressLine1] = useState(
    initialShipping.addressLine1 ?? ''
  );
  const [addressLine2, setAddressLine2] = useState(
    initialShipping.addressLine2 ?? ''
  );
  const [recipientFullName, setRecipientFullName] = useState(
    initialShipping.recipientFullName
  );
  const [recipientPhone, setRecipientPhone] = useState(
    initialShipping.recipientPhone
  );
  const [recipientEmail, setRecipientEmail] = useState(
    initialShipping.recipientEmail ?? ''
  );
  const [recipientComment, setRecipientComment] = useState(
    initialShipping.recipientComment ?? ''
  );
  const errorAlertId = `${useId()}-error`;

  const isWarehouseMethod =
    methodCode === 'NP_WAREHOUSE' || methodCode === 'NP_LOCKER';

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || isPending) return;

    setError(null);

    const trimmedCityRef = cityRef.trim();
    const trimmedWarehouseRef = warehouseRef.trim();
    const trimmedRecipientFullName = recipientFullName.trim();
    const trimmedRecipientPhone = recipientPhone.trim();

    const hasRequiredFields =
      trimmedCityRef.length > 0 &&
      trimmedRecipientFullName.length > 0 &&
      trimmedRecipientPhone.length > 0 &&
      (!isWarehouseMethod || trimmedWarehouseRef.length > 0);

    if (!hasRequiredFields) {
      setError(tEditor('errors.invalid'));
      return;
    }

    setIsSubmitting(true);

    let response: Response;
    try {
      response = await fetch(`/api/shop/admin/orders/${orderId}/shipping`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          provider: 'nova_poshta',
          methodCode,
          selection: {
            cityRef,
            ...(isWarehouseMethod
              ? { warehouseRef }
              : { addressLine1, addressLine2 }),
          },
          recipient: {
            fullName: recipientFullName,
            phone: recipientPhone,
            ...(recipientEmail.trim().length > 0
              ? { email: recipientEmail }
              : {}),
            ...(recipientComment.trim().length > 0
              ? { comment: recipientComment }
              : {}),
          },
        }),
      });
    } catch (requestError) {
      setError(mapError(normalizeErrorCode(requestError), tEditor));
      setIsSubmitting(false);
      return;
    }

    let json: Record<string, unknown> | null = null;
    try {
      json = (await response.json()) as Record<string, unknown>;
    } catch {
      json = null;
    }

    if (!response.ok) {
      const code =
        typeof json?.code === 'string'
          ? json.code
          : typeof json?.message === 'string'
            ? json.message
            : `HTTP_${response.status}`;
      setError(mapError(code, tEditor));
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <form className="grid gap-3" onSubmit={onSubmit}>
      <div>
        <label
          className="text-muted-foreground mb-1 block text-xs"
          htmlFor="shipping-method-code"
        >
          {t('shippingMethod')}
        </label>
        <select
          id="shipping-method-code"
          value={methodCode}
          onChange={event =>
            setMethodCode(event.target.value as ShippingMethodCode)
          }
          className="border-border bg-background text-foreground w-full rounded-lg border px-3 py-2 text-sm"
        >
          <option value="NP_WAREHOUSE">{methodLabel('NP_WAREHOUSE', t)}</option>
          <option value="NP_LOCKER">{methodLabel('NP_LOCKER', t)}</option>
          <option value="NP_COURIER">{methodLabel('NP_COURIER', t)}</option>
        </select>
      </div>

      <div>
        <label
          className="text-muted-foreground mb-1 block text-xs"
          htmlFor="shipping-city-ref"
        >
          {tEditor('cityRef')}
        </label>
        <input
          id="shipping-city-ref"
          value={cityRef}
          onChange={event => setCityRef(event.target.value)}
          required
          className="border-border bg-background text-foreground w-full rounded-lg border px-3 py-2 text-sm"
        />
        {initialShipping.cityLabel ? (
          <p className="text-muted-foreground mt-1 text-[11px]">
            {tEditor('currentCity', { city: initialShipping.cityLabel })}
          </p>
        ) : null}
      </div>

      {isWarehouseMethod ? (
        <div>
          <label
            className="text-muted-foreground mb-1 block text-xs"
            htmlFor="shipping-warehouse-ref"
          >
            {tEditor('pickupPointRef')}
          </label>
          <input
            id="shipping-warehouse-ref"
            value={warehouseRef}
            onChange={event => setWarehouseRef(event.target.value)}
            required
            className="border-border bg-background text-foreground w-full rounded-lg border px-3 py-2 text-sm"
          />
          {initialShipping.warehouseLabel ? (
            <p className="text-muted-foreground mt-1 text-[11px]">
              {tEditor('currentPickupPoint', {
                pickupPoint: initialShipping.warehouseLabel,
              })}
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <div>
            <label
              className="text-muted-foreground mb-1 block text-xs"
              htmlFor="shipping-address-line-1"
            >
              {tEditor('addressLine1')}
            </label>
            <input
              id="shipping-address-line-1"
              value={addressLine1}
              onChange={event => setAddressLine1(event.target.value)}
              className="border-border bg-background text-foreground w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label
              className="text-muted-foreground mb-1 block text-xs"
              htmlFor="shipping-address-line-2"
            >
              {tEditor('addressLine2')}
            </label>
            <input
              id="shipping-address-line-2"
              value={addressLine2}
              onChange={event => setAddressLine2(event.target.value)}
              className="border-border bg-background text-foreground w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
        </>
      )}

      <div>
        <label
          className="text-muted-foreground mb-1 block text-xs"
          htmlFor="shipping-recipient-full-name"
        >
          {t('recipientName')}
        </label>
        <input
          id="shipping-recipient-full-name"
          value={recipientFullName}
          onChange={event => setRecipientFullName(event.target.value)}
          required
          className="border-border bg-background text-foreground w-full rounded-lg border px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label
          className="text-muted-foreground mb-1 block text-xs"
          htmlFor="shipping-recipient-phone"
        >
          {t('recipientPhone')}
        </label>
        <input
          id="shipping-recipient-phone"
          value={recipientPhone}
          onChange={event => setRecipientPhone(event.target.value)}
          required
          className="border-border bg-background text-foreground w-full rounded-lg border px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label
          className="text-muted-foreground mb-1 block text-xs"
          htmlFor="shipping-recipient-email"
        >
          {t('recipientEmail')}
        </label>
        <input
          id="shipping-recipient-email"
          value={recipientEmail}
          onChange={event => setRecipientEmail(event.target.value)}
          className="border-border bg-background text-foreground w-full rounded-lg border px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label
          className="text-muted-foreground mb-1 block text-xs"
          htmlFor="shipping-recipient-comment"
        >
          {t('comment')}
        </label>
        <textarea
          id="shipping-recipient-comment"
          value={recipientComment}
          onChange={event => setRecipientComment(event.target.value)}
          className="border-border bg-background text-foreground min-h-24 w-full rounded-lg border px-3 py-2 text-sm"
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-xs">{tEditor('subtitle')}</p>
        <button
          type="submit"
          disabled={isSubmitting || isPending}
          aria-busy={isSubmitting || isPending}
          aria-describedby={error ? errorAlertId : undefined}
          className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:text-emerald-100"
        >
          {isSubmitting || isPending ? tEditor('saving') : tEditor('save')}
        </button>
      </div>

      {error ? (
        <p
          id={errorAlertId}
          role="alert"
          className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-100"
        >
          {error}
        </p>
      ) : null}
    </form>
  );
}
