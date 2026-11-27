import { cn } from '@/lib/utils';

interface SummaryField {
  label: string;
  value: string | number;
}

export function CheckoutOrderSummary({
  title,
  total,
  items,
  paymentStatus,
  capitalizePaymentStatus,
  shipmentStatus,
  trackingNumber,
}: {
  title: string;
  total: SummaryField;
  items: SummaryField;
  paymentStatus: SummaryField;
  capitalizePaymentStatus?: boolean;
  shipmentStatus?: SummaryField;
  trackingNumber?: SummaryField;
}) {
  return (
    <section
      className="mt-6 grid gap-6 md:grid-cols-2"
      aria-label="Order summary"
    >
      <div className="border-border bg-muted/40 rounded-md border p-4">
        <h2 className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
          {title}
        </h2>

        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">{total.label}</dt>
            <dd className="text-foreground font-semibold">{total.value}</dd>
          </div>

          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">{items.label}</dt>
            <dd className="text-foreground font-medium">{items.value}</dd>
          </div>

          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">{paymentStatus.label}</dt>
            <dd
              className={cn(
                'text-foreground font-semibold',
                capitalizePaymentStatus && 'capitalize'
              )}
            >
              {paymentStatus.value}
            </dd>
          </div>

          {shipmentStatus ? (
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">{shipmentStatus.label}</dt>
              <dd className="text-foreground text-right font-medium">
                {shipmentStatus.value}
              </dd>
            </div>
          ) : null}

          {trackingNumber ? (
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">{trackingNumber.label}</dt>
              <dd className="text-foreground text-right font-medium [overflow-wrap:anywhere] break-words">
                {trackingNumber.value}
              </dd>
            </div>
          ) : null}
        </dl>
      </div>
    </section>
  );
}
