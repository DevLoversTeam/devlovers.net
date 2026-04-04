import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import type { ApparelSizeGuide } from '@/lib/shop/size-guide';
import { cn } from '@/lib/utils';

interface SizeGuideAccordionProps {
  sizeGuide: ApparelSizeGuide;
  className?: string;
}

export function SizeGuideAccordion({
  sizeGuide,
  className,
}: SizeGuideAccordionProps) {
  return (
    <Accordion type="single" collapsible className={cn('w-full', className)}>
      <AccordionItem
        value="size-guide"
        className="border-border bg-muted/30 overflow-hidden rounded-xl border"
      >
        <AccordionTrigger className="text-foreground px-4 py-3 text-sm font-medium no-underline hover:no-underline">
          {sizeGuide.label}
        </AccordionTrigger>
        <AccordionContent className="border-border space-y-4 border-t px-4 pt-4 text-sm">
          <div className="space-y-2">
            <h3 className="text-foreground font-semibold">{sizeGuide.title}</h3>
            <p className="text-muted-foreground leading-6">{sizeGuide.intro}</p>
            <p className="text-muted-foreground leading-6">
              {sizeGuide.measurementNote}
            </p>
          </div>

          <ul className="text-muted-foreground list-disc space-y-2 pl-5 leading-6">
            {sizeGuide.fitNotes.map(note => (
              <li key={note}>{note}</li>
            ))}
          </ul>

          <div className="space-y-2">
            <p className="text-foreground text-xs font-semibold tracking-wide uppercase">
              {sizeGuide.chart.caption}
            </p>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[18rem] border-collapse text-left text-sm">
                <caption className="sr-only">{sizeGuide.chart.caption}</caption>
                <thead>
                  <tr className="border-border border-b text-xs tracking-wide uppercase">
                    <th className="text-muted-foreground py-2 pr-4 font-semibold">
                      {sizeGuide.chart.columns.size}
                    </th>
                    <th className="text-muted-foreground py-2 pr-4 font-semibold">
                      {sizeGuide.chart.columns.chestWidth}
                    </th>
                    <th className="text-muted-foreground py-2 font-semibold">
                      {sizeGuide.chart.columns.bodyLength}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sizeGuide.chart.rows.map(row => (
                    <tr
                      key={row.size}
                      className="border-border border-b last:border-b-0"
                    >
                      <td className="text-foreground py-2 pr-4 font-medium">
                        {row.size}
                      </td>
                      <td className="text-muted-foreground py-2 pr-4">
                        {row.chestWidthCm} {sizeGuide.chart.unit}
                      </td>
                      <td className="text-muted-foreground py-2">
                        {row.bodyLengthCm} {sizeGuide.chart.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
