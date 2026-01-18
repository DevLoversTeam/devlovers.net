"use client"

import { motion } from "framer-motion"
import { ArrowUpRight } from "lucide-react"
import { TOPICS } from "@/data/about"
import Image from "next/image"
import Link from "next/link" 

export function TopicsSection() {
    return (
        <section id="topics" className="w-full py-24 bg-gray-50 dark:bg-transparent">
            <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
                    
                    <div className="mb-16 md:flex md:justify-between md:items-end">
                        <div className="max-w-2xl">
                            <motion.div 
                                initial={{ opacity: 0, x: -20 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                className="text-blue-600 dark:text-[#ff2d55] font-bold uppercase tracking-widest text-xs mb-4"
                            >
                                / The Ecosystem
                            </motion.div>
                            <h2 className="text-4xl md:text-5xl font-black text-black dark:text-white tracking-tighter">
                                Master your <br />
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#1e5eff] to-[#174ad6] dark:from-[#ff2d55] dark:to-[#e0264b]">
                                    entire stack
                                </span>
                            </h2>
                        </div>
                        
                        <p className="hidden md:block text-neutral-600 dark:text-neutral-400 max-w-sm text-base font-normal mt-4 md:mt-0 md:mb-2">
                             From frontend frameworks to backend logic. <br/> We cover the key technologies for 2026.
                        </p>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                        {TOPICS.map((topic, i) => (
                            <TopicCard key={topic.id} topic={topic} index={i} />
                        ))}
                    </div>

            </div>
        </section>
    )
}

function TopicCard({ topic, index }: { topic: any, index: number }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            viewport={{ once: true, margin: "-50px" }}
            className="group relative h-full"
        >
            <Link href={topic.href} className="block h-full">
                <div className={`
                    relative overflow-hidden
                    h-full p-6 rounded-2xl 
                    border border-black/5 dark:border-white/5 
                    bg-white dark:bg-neutral-900/40 backdrop-blur-sm
                    transition-all duration-300 ease-out
                    ${topic.color} 
                    hover:-translate-y-1 hover:shadow-xl dark:hover:shadow-black/50
                    cursor-pointer
                `}>
                        
                        <div className="flex justify-between items-start mb-6">
                            <div className="relative w-10 h-10 grayscale group-hover:grayscale-0 transition-all duration-300 group-hover:scale-110">
                                <Image 
                                    src={topic.icon} 
                                    alt={topic.name}
                                    fill
                                    className={`object-contain ${topic.className || ''}`}
                                />
                            </div>
                            <ArrowUpRight size={16} className="text-neutral-300 dark:text-neutral-700 group-hover:text-black dark:group-hover:text-white transition-colors" />
                        </div>

                        <div>
                            <h3 className="text-sm font-bold text-black dark:text-white mb-1 leading-tight">
                                {topic.name}
                            </h3>
                            <p className="text-[10px] font-mono text-neutral-500 dark:text-neutral-500 uppercase tracking-wider">
                                {topic.questions}
                            </p>
                        </div>

                        <div className={`
                            absolute -bottom-6 -right-6 w-20 h-20 rounded-full blur-[40px] opacity-0 
                            group-hover:opacity-40 transition-opacity duration-500
                            ${topic.glow}
                        `} />
                </div>
            </Link>
        </motion.div>
    )
}