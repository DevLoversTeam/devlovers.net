import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Q&A Admin | DevLovers',
};

export default function AdminQaPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-foreground text-2xl font-bold">Q&A</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Manage interview questions and answers
      </p>

      <div className="border-border text-muted-foreground mt-6 rounded-lg border border-dashed p-8 text-center text-sm">
        Q&A management will be implemented here
      </div>
    </div>
  );
}
