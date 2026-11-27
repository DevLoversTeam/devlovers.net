export function LegalEmailLink({ email }: { email: string }) {
  return (
    <a
      className="underline underline-offset-4 transition-colors hover:text-blue-600 dark:hover:text-blue-400"
      href={`mailto:${email}`}
    >
      {email}
    </a>
  );
}
