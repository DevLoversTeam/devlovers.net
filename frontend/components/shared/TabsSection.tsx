'use client';

import { useState, useEffect } from 'react';
import AccordionList from '@/components/shared/AccordionList';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

const categories = ['react', 'angular', 'vue', 'javascript'];

export default function TabsSection() {
  const [active, setActive] = useState('react');
  const [items, setItems] = useState([]);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/questions/${active}`);
      const data = await res.json();
      setItems(data);
    }
    load();
  }, [active]);

  return (
    <Tabs defaultValue="react" onValueChange={setActive} className="w-full">
      <TabsList className="grid grid-cols-4 mb-6">
        {categories.map(c => (
          <TabsTrigger key={c} value={c}>
            {c}
          </TabsTrigger>
        ))}
      </TabsList>

      {categories.map(c => (
        <TabsContent key={c} value={c}>
          <AccordionList items={items} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
