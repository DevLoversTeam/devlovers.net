'use client';

import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';

export default function AccordionList({ items }: { items: any[] }) {
  return (
    <Accordion type="single" collapsible className="w-full">
      {items.map(q => (
        <AccordionItem key={q.id} value={String(q.id)}>
          <AccordionTrigger>{q.question}</AccordionTrigger>

          <AccordionContent>
            <div className="space-y-4 pt-2">
              {q.answerBlocks.map((block: any, i: number) => {
                if (block.type === 'text') {
                  return <p key={i}>{block.content}</p>;
                }

                if (block.type === 'list') {
                  return (
                    <ul key={i} className="list-disc list-inside space-y-1">
                      {block.items.map((item: string, j: number) => (
                        <li key={j}>{item}</li>
                      ))}
                    </ul>
                  );
                }

                if (block.type === 'code') {
                  return (
                    <pre
                      key={i}
                      className="bg-gray-900 text-white p-3 rounded text-sm overflow-auto"
                    >
                      <code>{block.content}</code>
                    </pre>
                  );
                }

                return null;
              })}
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
