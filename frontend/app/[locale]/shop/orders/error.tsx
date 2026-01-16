'use client';

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function OrdersError({ reset }: ErrorPageProps) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Orders</h1>

      <div className="mt-6 rounded-md border p-4">
        <p className="text-sm">Failed to load orders.</p>
        <button
          type="button"
          className="mt-3 text-sm underline underline-offset-4"
          onClick={() => reset()}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
