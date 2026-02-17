'use client';

import {
  BarChart3,
  ClipboardList,
  FileQuestion,
  LayoutDashboard,
  MessageSquare,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  ShoppingBag,
} from 'lucide-react';
import { useSyncExternalStore } from 'react';

import { Link, usePathname } from '@/i18n/routing';
import { cn } from '@/lib/utils';

type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
};

type NavSection = {
  label: string;
  icon: React.ElementType;
  basePath: string;
  items: NavItem[];
};

const STORAGE_KEY = 'admin-sidebar-collapsed';

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Shop',
    icon: ShoppingBag,
    basePath: '/admin/shop',
    items: [
      { label: 'Products', href: '/admin/shop/products', icon: Package },
      { label: 'Orders', href: '/admin/shop/orders', icon: ClipboardList },
    ],
  },
  {
    label: 'Quiz',
    icon: FileQuestion,
    basePath: '/admin/quiz',
    items: [
      { label: 'Quizzes', href: '/admin/quiz', icon: FileQuestion },
      { label: 'Statistics', href: '/admin/quiz/statistics', icon: BarChart3 },
    ],
  },
  {
    label: 'Q&A',
    icon: MessageSquare,
    basePath: '/admin/q&a',
    items: [
      { label: 'Questions', href: '/admin/q&a', icon: MessageSquare },
    ],
  },
];

function subscribeToStorage(callback: () => void) {
  const key = STORAGE_KEY;
  const handler = () => callback();
  window.addEventListener(`storage:${key}`, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(`storage:${key}`, handler);
    window.removeEventListener('storage', handler);
  };
}

function getCollapsedSnapshot() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function getCollapsedServerSnapshot() {
  return false;
}


export function AdminSidebar() {
  const pathname = usePathname();

  const collapsed = useSyncExternalStore(
  subscribeToStorage,
  getCollapsedSnapshot,
  getCollapsedServerSnapshot
);

const toggle = () => {
    const next = !collapsed;
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // localStorage unavailable
    }
    window.dispatchEvent(new Event(`storage:${STORAGE_KEY}`));
  };

  const allHrefs = NAV_SECTIONS.flatMap(s => s.items.map(i => i.href));

  const isActive = (href: string) => {
    if (pathname === href) return true;
    if (pathname.startsWith(href + '/')) {
      return !allHrefs.some(
        other => other !== href && other.length > href.length && pathname.startsWith(other)
      );
    }
    return false;
  };


  return (
    <aside
      className={cn(
        'border-border bg-background relative flex h-full shrink-0 flex-col border-r transition-[width] duration-200',
        collapsed ? 'w-14' : 'w-60'
      )}
    >
      <button
        type="button"
        onClick={toggle}
        className="bg-background border-border text-muted-foreground hover:text-foreground absolute -right-3 top-5 z-10 flex h-6 w-6 items-center justify-center rounded-full border shadow-sm transition-colors"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? (
          <PanelLeftOpen className="h-3.5 w-3.5" />
        ) : (
          <PanelLeftClose className="h-3.5 w-3.5" />
        )}
      </button>
      {/* Header */}
      <div className="border-border flex h-14 items-center border-b px-3">
        <Link
          href="/admin"
            className={cn(
              'flex items-center gap-2 font-semibold',
              pathname === '/admin'
                ? 'text-[var(--accent-primary)]'
                : 'text-foreground',
              collapsed && 'justify-center'
            )}
          title="Admin Dashboard"
        >
          <LayoutDashboard className="h-5 w-5 shrink-0" />
          {!collapsed && <span>Admin</span>}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3">
        {NAV_SECTIONS.map(section => (
          <div key={section.label} className="mb-4">
            {!collapsed && (
              <div
                className={cn(
                  'px-3 pb-1 text-[11px] font-medium uppercase tracking-wider',
                  pathname.startsWith(section.basePath)
                    ? 'text-[var(--accent-primary)]'
                    : 'text-muted-foreground'
                )}
              >
                {section.label}
              </div>
            )}

            {collapsed && (
              <div
                className={cn(
                  'flex justify-center pb-1',
                  pathname.startsWith(section.basePath)
                    ? 'text-[var(--accent-primary)]'
                    : 'text-muted-foreground'
                )}
              >
                <section.icon className="h-4 w-4" />
              </div>
            )}
            <ul className="space-y-0.5 px-2">
              {section.items.map(item => {
                const active = isActive(item.href);

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors',
                        active
                          ? 'bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        collapsed && 'justify-center'
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer: collapse toggle + back to site */}
      <div className="border-border space-y-1 border-t p-2">
        <Link
          href="/"
          title={collapsed ? 'Back to site' : undefined}
          className={cn(
            'text-muted-foreground hover:text-foreground flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
            collapsed && 'justify-center'
          )}
        >
          <span className="shrink-0 text-sm">&#8592;</span>
          {!collapsed && <span>Back to site</span>}
        </Link>
      </div>
    </aside>
  );
}
