'use client';

import { Bell, FileText, ShoppingBag, Trophy, Info, CheckCircle2, User } from 'lucide-react';
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
  const [displayLimit, setDisplayLimit] = useState(5);

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
      case 'SYSTEM':
        return <User className="h-4 w-4" />;
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
      case 'SYSTEM':
        return 'bg-emerald-500/10 text-emerald-500';
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
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="absolute top-full right-0 z-70 mt-3 w-80 rounded-2xl border border-gray-200/50 bg-white/95 p-2 shadow-lg backdrop-blur-3xl sm:w-96 dark:border-white/10 dark:bg-neutral-900/95"
          >
            <div className="mb-2 flex items-center justify-between border-b border-gray-100/50 px-2 pb-2 dark:border-white/10">
              <p className="text-sm font-semibold tracking-wide text-gray-900 dark:text-white">
                Notifications
              </p>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  className="group flex items-center gap-1.5 text-xs font-semibold text-(--accent-primary) transition-colors hover:text-(--accent-hover)"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 transition-transform group-hover:scale-110" />
                  Mark all as read
                </button>
              )}
            </div>

            <div className="flex max-h-[400px] flex-col gap-1 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-200 hover:scrollbar-thumb-gray-300 dark:scrollbar-thumb-white/10 dark:hover:scrollbar-thumb-white/20">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-10 opacity-50 px-4">
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="mb-3">
                    <Bell className="h-5 w-5 text-muted-foreground" />
                  </motion.div>
                  <p className="text-xs tracking-wider text-muted-foreground uppercase text-center">Syncing</p>
                </div>
              ) : notifications.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }} 
                  animate={{ opacity: 1, scale: 1 }} 
                  className="flex flex-col items-center justify-center py-12 text-center px-4"
                >
                  <div className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary ring-8 ring-secondary/30 dark:bg-white/5 dark:ring-white/5">
                    <Bell className="h-7 w-7 text-muted-foreground opacity-50" />
                    <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-white dark:bg-neutral-900 border-2 border-transparent">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    </div>
                  </div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">All caught up!</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-[200px] mx-auto">You've handled all your recent activity.</p>
                </motion.div>
              ) : (
                <AnimatePresence mode="popLayout" initial={false}>
                  {notifications.map((notification, index) => (
                    <motion.div
                      key={notification.id}
                      layout
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ 
                        type: 'spring',
                        stiffness: 400,
                        damping: 30,
                        delay: index * 0.02 
                      }}
                      onClick={() => handleMarkAsRead(notification.id, notification.isRead)}
                      className={`relative flex cursor-pointer items-start gap-3 rounded-lg p-3 transition-colors duration-200 group ${
                        notification.isRead 
                          ? 'text-muted-foreground hover:bg-secondary hover:text-foreground active:bg-secondary' 
                          : 'bg-(--accent-primary)/10 text-gray-900 dark:text-white'
                      }`}
                    >
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full shadow-xs transition-transform group-hover:scale-105 ${getIconStylesForType(notification.type)}`}>
                        {getIconForType(notification.type)}
                      </div>
                      <div className="flex-1 space-y-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-sm leading-tight pt-0.5 ${notification.isRead ? 'font-medium' : 'font-bold'}`}>
                            {notification.title}
                          </p>
                          {!notification.isRead && (
                            <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-(--accent-primary) shadow-[0_0_8px_var(--accent-primary)]" title="Unread" />
                          )}
                        </div>
                        <p className={`text-xs leading-relaxed line-clamp-2 ${notification.isRead ? 'opacity-70' : 'opacity-90'}`}>
                          {notification.message}
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                           <span className="text-[10px] font-bold uppercase tracking-widest opacity-50">
                             {getIconForType(notification.type).type.name === 'User' ? 'System' : notification.type}
                           </span>
                           <span className="h-0.5 w-0.5 rounded-full bg-muted-foreground/30" />
                           <span className="text-[10px] font-medium opacity-40">
                             {getRelativeTime(notification.createdAt)}
                           </span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>
            
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
