import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Quiz Statistics | DevLovers',
};

export default function AdminQuizStatisticsPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-foreground text-2xl font-bold">Quiz Statistics</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Analytics, trends, and user metrics
      </p>

      <div className="border-border text-muted-foreground mt-6 rounded-lg border border-dashed p-8 text-center text-sm">
        Statistics dashboard will be implemented here
      </div>
    </div>
  );
}
