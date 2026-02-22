'use client';

import { Bell, FileText, ShoppingBag, Trophy, Info, CheckCircle2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getNotifications, markAllAsRead, markAsRead } from '@/actions/notifications';

function getRelativeTime(date: Date) {
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const daysDifference = Math.round((date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
  if (daysDifference === 0) {
    const hoursDifference = Math.round((date.getTime() - new Date().getTime()) / (1000 * 60 * 60));
    if (hoursDifference === 0) {
       const minutesDifference = Math.round((date.getTime() - new Date().getTime()) / (1000 * 60));
       if (minutesDifference === 0) return 'Just now';
       return rtf.format(minutesDifference, 'minute');
    }
    return rtf.format(hoursDifference, 'hour');
  }
  return rtf.format(daysDifference, 'day');
}

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: Date;
  metadata?: any;
};

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const t = useTranslations('navigation');
  
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = async () => {
    try {
      const data = await getNotifications();
      // data from db may have Date strings or objects, map accordingly
      const parsed = data.map(n => ({
        ...n,
        createdAt: new Date(n.createdAt)
      }));
      setNotifications(parsed);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    // Poll every 30 seconds for new notifications just in case
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // Re-fetch when opening so we know it's fresh
      fetchNotifications();
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleMarkAllAsRead = async () => {
    await markAllAsRead();
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, isRead: true }))
    );
  };

  const handleMarkAsRead = async (id: string, isRead: boolean) => {
    if (isRead) return;
    await markAsRead(id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
  };

  const getIconForType = (type: string) => {
    switch (type) {
      case 'ACHIEVEMENT':
        return <Trophy className="h-4 w-4" />;
      case 'ARTICLE':
        return <FileText className="h-4 w-4" />;
      case 'SHOP':
        return <ShoppingBag className="h-4 w-4" />;
      default:
        return <Info className="h-4 w-4" />;
    }
  };

  const getIconStylesForType = (type: string) => {
    switch (type) {
      case 'ACHIEVEMENT':
        return 'bg-(--accent-primary)/10 text-(--accent-primary)';
      case 'ARTICLE':
        return 'bg-blue-500/10 text-blue-500';
      case 'SHOP':
        return 'bg-purple-500/10 text-purple-500';
      default:
        return 'bg-gray-500/10 text-gray-500';
    }
  };

  return (
    <div className="relative flex items-center" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="text-muted-foreground hover:bg-secondary active:bg-secondary relative flex h-9 w-9 items-center justify-center rounded-md transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
            <span className="bg-(--accent-primary) absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"></span>
            <span className="bg-(--accent-primary) relative inline-flex h-2.5 w-2.5 rounded-full shadow-[0_0_8px_var(--accent-primary)] border border-white dark:border-neutral-900"></span>
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="absolute top-full right-0 z-70 mt-3 w-80 rounded-2xl border border-gray-200/50 bg-white/95 p-4 shadow-xl backdrop-blur-3xl sm:w-96 dark:border-white/10 dark:bg-neutral-900/95"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold tracking-wide text-gray-900 dark:text-white">
                Notifications
              </h3>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  className="group flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-(--accent-primary)"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 transition-transform group-hover:scale-110" />
                  Mark all as read
                </button>
              )}
            </div>

            <div className="flex max-h-[350px] flex-col gap-2 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-white/10">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-10 opacity-50">
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="mb-3">
                    <Bell className="h-5 w-5 text-muted-foreground" />
                  </motion.div>
                  <p className="text-xs tracking-wider text-muted-foreground uppercase">Syncing</p>
                </div>
              ) : notifications.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }} 
                  className="flex flex-col items-center justify-center py-12 text-center"
                >
                  <div className="relative mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-secondary dark:bg-white/5">
                    <Bell className="h-6 w-6 text-muted-foreground opacity-50" />
                    <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-white dark:bg-neutral-900 border-2 border-transparent">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    </div>
                  </div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-200">All caught up!</p>
                  <p className="text-xs text-muted-foreground mt-1">You have no new notifications.</p>
                </motion.div>
              ) : (
                notifications.map((notification, index) => (
                  <motion.div
                    key={notification.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05, duration: 0.2 }}
                    onClick={() => handleMarkAsRead(notification.id, notification.isRead)}
                    className={`relative flex cursor-pointer items-start gap-3 rounded-xl p-3 transition-all duration-200 ${
                      notification.isRead 
                        ? 'hover:bg-gray-100/50 dark:hover:bg-white/5 opacity-80 hover:opacity-100' 
                        : 'bg-white shadow-xs hover:shadow-sm dark:bg-white/5 dark:hover:bg-white/10 ring-1 ring-black/5 dark:ring-white/10'
                    }`}
                  >
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${getIconStylesForType(notification.type)}`}>
                      {getIconForType(notification.type)}
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className={`text-sm tracking-tight ${notification.isRead ? 'text-gray-600 dark:text-gray-400 font-normal' : 'text-gray-900 dark:text-white font-medium'}`}>
                        {notification.title}
                      </p>
                      <p className="text-xs leading-relaxed text-muted-foreground line-clamp-2">
                        {notification.message}
                      </p>
                      <p className="mt-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
                        {getRelativeTime(notification.createdAt)}
                      </p>
                    </div>
                    {!notification.isRead && (
                      <div className="bg-(--accent-primary) mt-1.5 h-2 w-2 shrink-0 rounded-full shadow-[0_0_8px_var(--accent-primary)]"></div>
                    )}
                  </motion.div>
                ))
              )}
            </div>
            
            {notifications.length > 0 && (
              <div className="mt-3 border-t border-gray-100/50 pt-3 text-center dark:border-white/10">
                <button className="text-xs font-semibold tracking-wide text-(--accent-primary) transition-colors hover:text-(--accent-hover)">
                  View all notifications
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
