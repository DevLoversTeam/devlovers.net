import Link from 'next/link';

export default function RootNotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="text-center px-6 py-12">
        <p className="text-8xl md:text-9xl font-black text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-violet-400 to-pink-400">
          404
        </p>

        <h1 className="mt-6 text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">
          Page Not Found
        </h1>

        <p className="mt-4 max-w-md mx-auto text-slate-600 dark:text-slate-400">
          Sorry, we couldn&apos;t find the page you&apos;re looking for.
        </p>

        <Link
          href="/"
          className="mt-8 inline-flex items-center justify-center rounded-full bg-gradient-to-r from-sky-500 to-violet-500 px-6 py-3 text-sm font-medium text-white transition-all hover:from-sky-600 hover:to-violet-600"
        >
          Back to Home
        </Link>
      </div>
    </main>
  );
}
