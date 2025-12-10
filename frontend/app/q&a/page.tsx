import { Suspense } from 'react';
import TabsSection from '@/components/shared/TabsSection';

export const metadata = {
  title: 'Q&A | DevLovers',
  description:
    'Питання та відповіді для підготовки до технічних співбесід з React, Angular, Vue та JavaScript.',
};

function TabsSectionFallback() {
  return (
    <div className="w-full">
      <div className="grid grid-cols-4 gap-2 mb-6">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="h-10 bg-gray-200 dark:bg-gray-800 rounded-lg animate-pulse"
          />
        ))}
      </div>
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="h-16 bg-gray-200 dark:bg-gray-800 rounded-lg animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}

export default function QAPage() {
  return (
    <main className="max-w-3xl mx-auto py-10">
      <Suspense fallback={<TabsSectionFallback />}>
        <TabsSection />
      </Suspense>
    </main>
  );
}

// import TabsSection from '@/components/shared/TabsSection';

// export default function QAPage() {
//   return (
//     <main className="max-w-3xl mx-auto py-10">
//       <TabsSection />
//     </main>
//   );
// }
