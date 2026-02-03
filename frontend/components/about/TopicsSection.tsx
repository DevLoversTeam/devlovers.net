'use client';

import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { type Topic, TOPICS } from '@/data/about';

export function TopicsSection() {
  const t = useTranslations('about.topics');

  return (
    <section
      id="topics"
      className="w-full bg-gray-50 py-20 lg:py-28 dark:bg-transparent"
    >
      <div className="container-main">
        <div className="mb-16 md:flex md:items-end md:justify-between">
          <div className="max-w-2xl">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              className="mb-4 text-xs font-bold tracking-widest text-blue-600 uppercase dark:text-[#ff2d55]"
            >
              {t('pretitle')}
            </motion.div>
            <h2 className="text-4xl font-black tracking-tighter text-black md:text-5xl lg:text-6xl dark:text-white">
              {t('titleStart')} <br />
              <span className="bg-gradient-to-r from-[#1e5eff] to-[#1e5eff]/70 bg-clip-text text-transparent dark:from-[#ff2d55] dark:to-[#ff2d55]/70">
                {t('titleHighlight')}
              </span>
            </h2>
          </div>

          <p className="mt-4 hidden max-w-sm text-base font-normal text-neutral-600 md:mt-0 md:mb-2 md:block dark:text-neutral-400">
            {t('description')}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {TOPICS.map((topic, i) => (
            <TopicCard key={topic.id} topic={topic as Topic} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

function TopicCard({ topic, index }: { topic: Topic; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      viewport={{ once: true, margin: '-50px' }}
      className="group relative h-full"
    >
      <Link href={topic.href} className="block h-full">
        <div
          className={`relative h-full overflow-hidden rounded-2xl border border-black/5 bg-white p-6 backdrop-blur-sm transition-all duration-300 ease-out dark:border-white/5 dark:bg-neutral-900/40 ${topic.color} cursor-pointer hover:-translate-y-1 hover:shadow-xl dark:hover:shadow-black/50`}
        >
          <div className="mb-6 flex items-start justify-between">
            <div className="relative h-10 w-10 grayscale transition-all duration-300 group-hover:scale-110 group-hover:grayscale-0">
              <Image
                src={topic.icon}
                alt={topic.name}
                fill
                className="object-contain"
              />
            </div>
            <ArrowUpRight
              size={16}
              className="text-neutral-300 transition-colors group-hover:text-black dark:text-neutral-700 dark:group-hover:text-white"
            />
          </div>

          <div>
            <h3 className="mb-1 text-sm leading-tight font-bold text-black dark:text-white">
              {topic.name}
            </h3>
            <p className="font-mono text-[10px] tracking-wider text-neutral-500 uppercase dark:text-neutral-500">
              {topic.questions}
            </p>
          </div>

          <div
            className={`absolute -right-6 -bottom-6 h-20 w-20 rounded-full opacity-0 blur-[40px] transition-opacity duration-500 group-hover:opacity-40 ${topic.glow} `}
          />
        </div>
      </Link>
    </motion.div>
  );
}
