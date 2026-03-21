import { Metadata } from 'next';

export const metadata: Metadata = { title: 'Authors | DevLovers' };

export default function AdminBlogAuthorsPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-foreground text-2xl font-bold">Authors</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Author management coming...
      </p>
    </div>
  );
}
