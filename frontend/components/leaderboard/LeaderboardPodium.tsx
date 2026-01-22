'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import { Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { User } from './types';

export function LeaderboardPodium({ topThree }: { topThree: User[] }) {
  const podiumOrder = [
    topThree.find(u => u.rank === 2),
    topThree.find(u => u.rank === 1),
    topThree.find(u => u.rank === 3),
  ].filter(Boolean) as User[];

  return (
    <div className="flex items-end justify-center gap-4 md:gap-8 h-[350px] w-full max-w-3xl mx-auto">
      {podiumOrder.map((user) => {
        const isFirst = user.rank === 1;
        const isSecond = user.rank === 2;
        
        const height = isFirst ? '100%' : isSecond ? '45%' : '30%';
        const delay = isFirst ? 0.4 : isSecond ? 0.2 : 0.6;

        return (
          <div key={user.id} className="relative flex flex-col items-center justify-end w-1/3 h-full">
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: delay + 0.5, duration: 0.5 }}
              className="mb-4 flex flex-col items-center text-center z-10"
            >
              <div className="relative mb-2">
                {isFirst && (
                  <Crown 
                    className="absolute -top-8 left-1/2 -translate-x-1/2 w-6 h-6 text-[var(--accent-primary)] animate-bounce" 
                    fill="currentColor"
                  />
                )}
                <div className={cn(
                  "relative w-16 h-16 md:w-20 md:h-20 rounded-full p-1 transition-colors duration-300",
                  "border-2",
                  isFirst 
                    ? "border-[var(--accent-primary)]" 
                    : "border-gray-200 dark:border-white/20"
                )}>
                  <div className="relative w-full h-full rounded-full overflow-hidden bg-gray-100 dark:bg-black">
                    <Image
                      src={user.avatar}
                      alt={user.username}
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div className={cn(
                    "absolute -bottom-2 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-md transition-colors duration-300",
                    isFirst 
                        ? "bg-[var(--accent-primary)]" 
                        : "bg-gray-500 dark:bg-gray-700"
                  )}>
                    {user.rank}
                  </div>
                </div>
              </div>
              
              <div className="font-bold text-gray-900 dark:text-white text-sm md:text-base truncate max-w-[100px] md:max-w-[140px]">
                {user.username}
              </div>
              <div className="font-mono text-xs font-bold text-[var(--accent-primary)]">
                {user.points} 
              </div>
            </motion.div>

            <motion.div
              initial={{ height: 0 }}
              animate={{ height: height }}
              transition={{ 
                duration: 0.8, 
                delay: delay, 
                type: "spring", 
                stiffness: 60,
                damping: 15 
              }}
              className={cn(
                "w-full rounded-t-2xl relative overflow-hidden backdrop-blur-xl border-x border-t transition-colors duration-300",
                "bg-white/60 border-gray-100 dark:bg-[#111]/60 dark:border-white/5",
                
                isFirst 
                  ? "shadow-[0_0_50px_-15px_var(--accent-primary)]"
                  : "shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] dark:shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.5)]"
              )}
            >
              <div className={cn(
                "w-full h-1.5 absolute top-0 left-0 transition-colors duration-300",
                isFirst 
                  ? "bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-hover)]"
                  : "bg-gray-200 dark:bg-white/10"
              )} />
              
              
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}