"use client"

import { motion } from "framer-motion"
import { MessageCircle } from "lucide-react"

const testimonials = [
  {
    name: "Alex Chen",
    role: "Frontend Engineer @ Meta",
    avatar: "AC",
    content: "DevLovers helped me nail my system design interviews. The community is incredibly supportive!",
    platform: "LinkedIn",
  },
  {
    name: "Sarah Johnson",
    role: "Senior SWE @ Google",
    avatar: "SJ",
    content: "Finally, a free resource that actually prepares you for real interviews. The questions are spot-on.",
    platform: "Twitter",
  },
  {
    name: "Marcus Williams",
    role: "Backend Developer @ Stripe",
    avatar: "MW",
    content: "Went from struggling with DSA to getting multiple offers. Can't recommend this enough! 🚀",
    platform: "Twitter",
  },
  {
    name: "Emily Park",
    role: "Full Stack @ Vercel",
    avatar: "EP",
    content: "The interactive quizzes are addictive. I've learned more here than months of LeetCode grinding.",
    platform: "LinkedIn",
  },
  {
    name: "David Kim",
    role: "Staff Engineer @ Netflix",
    avatar: "DK",
    content:
      "Love the community challenges! Great way to practice under pressure. This is the future of interview prep.",
    platform: "Twitter",
  },
  {
    name: "Lisa Thompson",
    role: "Engineering Manager @ Amazon",
    avatar: "LT",
    content: "I recommend DevLovers to all my mentees. It's become essential for anyone preparing for tech interviews.",
    platform: "LinkedIn",
  },
]

export function CommunitySection() {
  return (
    <section className="overflow-hidden px-6 py-24 bg-background transition-colors duration-300">
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-16 text-center"
        >
          <h2 className="text-3xl font-bold text-foreground md:text-4xl transition-colors duration-300">
            Trusted by the Community
          </h2>
          <p className="mt-4 text-muted-foreground transition-colors duration-300">
            Join thousands of developers who&apos;ve leveled up their interview skills
          </p>
        </motion.div>

        <div className="relative">
          <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-32 bg-gradient-to-r from-background to-transparent transition-colors duration-300" />
          <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-32 bg-gradient-to-l from-background to-transparent transition-colors duration-300" />

          <div className="flex gap-6 overflow-hidden">
            <motion.div
              animate={{ x: [0, -1920] }}
              transition={{ duration: 60, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
              className="flex shrink-0 gap-6"
            >
              {[...testimonials, ...testimonials].map((testimonial, index) => (
                <TestimonialCard key={index} {...testimonial} />
              ))}
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  )
}

function TestimonialCard({
  name,
  role,
  avatar,
  content,
  platform,
}: {
  name: string
  role: string
  avatar: string
  content: string
  platform: string
}) {
  return (
    <div className="w-80 shrink-0 rounded-2xl border border-border bg-card p-6 backdrop-blur-sm transition-colors duration-300">
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#2C7FFF] to-sky-400 text-sm font-bold text-white shadow-lg shadow-[#2C7FFF]/20">
            {avatar}
          </div>
          <div>
            <div className="font-semibold text-foreground transition-colors duration-300">{name}</div>
            <div className="text-xs text-muted-foreground transition-colors duration-300">{role}</div>
          </div>
        </div>
        
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted transition-colors duration-300">
          <MessageCircle className="h-3 w-3 text-muted-foreground" />
        </div>
      </div>
      
      <p className="text-sm leading-relaxed text-muted-foreground transition-colors duration-300">{content}</p>
      
      <div className="mt-4 text-xs text-muted-foreground/60 transition-colors duration-300">via {platform}</div>
    </div>
  )
}