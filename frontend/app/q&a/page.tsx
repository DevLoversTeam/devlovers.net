import TabsSection from '@/components/shared/TabsSection';

export const metadata = {
  title: 'Q&A | DevLovers',
  description:
    'Питання та відповіді для підготовки до технічних співбесід з React, Angular, Vue та JavaScript.',
};

export default function QAPage() {
  return (
    <main className="max-w-3xl mx-auto py-10">
      <TabsSection />
    </main>
  );
}
