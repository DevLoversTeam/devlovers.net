import { Metadata } from 'next';
import { FileQuestion, ShoppingBag } from 'lucide-react';

import { Link } from '@/i18n/routing';

export const metadata: Metadata = {
  title: 'Admin | DevLovers',
  description: 'Administrative dashboard',
};

const SECTIONS = [
  {
    title: 'Shop',
    description: 'Manage products, orders, and inventory',
    href: '/admin/shop' as const,
    icon: ShoppingBag,
  },
  {
    title: 'Quiz',
    description: 'Edit quizzes, questions, and view statistics',
    href: '/admin/quiz' as const,
    icon: FileQuestion,
  },
];

export default function AdminHomePage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-foreground text-2xl font-bold">Admin Dashboard</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Manage content across the platform
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {SECTIONS.map(section => (
          <Link
            key={section.href}
            href={section.href}
            className="border-border hover:bg-muted/50 flex items-start gap-4 rounded-lg border p-5 transition-colors"
          >
            <section.icon className="text-muted-foreground mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <div className="text-foreground text-base font-semibold">
                {section.title}
              </div>
              <div className="text-muted-foreground mt-1 text-sm">
                {section.description}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
