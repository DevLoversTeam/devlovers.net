'use client';

import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { ChevronDownIcon } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

function Accordion({
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Root>) {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />;
}

function AccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn('border-b last:border-b-0', className)}
      {...props}
    />
  );
}

function AccordionTrigger({
  className,
  children,
  leading,
  trailing,
  chevronOutside = false,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger> & {
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  chevronOutside?: boolean;
}) {
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);

  return (
    <AccordionPrimitive.Header className="group flex items-center">
      {leading}
      <AccordionPrimitive.Trigger
        ref={triggerRef}
        data-slot="accordion-trigger"
        className={cn(
          'focus-visible:border-ring focus-visible:ring-ring/50 flex flex-1 items-center justify-between gap-4 rounded-md py-4 text-left text-sm font-medium transition-all outline-none hover:underline focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 [&[data-state=open]>svg]:rotate-180',
          className
        )}
        {...props}
      >
        {children}
        {!chevronOutside && (
          <ChevronDownIcon
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none size-4 shrink-0 transition-transform duration-200"
          />
        )}
      </AccordionPrimitive.Trigger>
      {trailing}
      {chevronOutside && (
        <button
          type="button"
          aria-label="Toggle accordion"
          className="text-muted-foreground mr-4 inline-flex size-6 shrink-0 items-center justify-center self-center rounded-sm transition-colors duration-200 hover:bg-black/5 dark:hover:bg-white/5"
          onClick={() => triggerRef.current?.click()}
        >
          <ChevronDownIcon
            aria-hidden="true"
            className="pointer-events-none size-4 transition-transform duration-200 group-data-[state=open]:rotate-180"
          />
        </button>
      )}
    </AccordionPrimitive.Header>
  );
}

function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      data-slot="accordion-content"
      className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden text-sm motion-reduce:!animate-none"
      {...props}
    >
      <div className={cn('pt-0 pb-4', className)}>{children}</div>
    </AccordionPrimitive.Content>
  );
}

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger };
