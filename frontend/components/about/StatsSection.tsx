"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Star, Linkedin, Users, Terminal } from "lucide-react"

const GITHUB_USERNAME = "DevLoversTeam"
const GITHUB_REPO = "devlovers.net"
const LINKEDIN_COUNT = "1.2k+"      
const ACTIVE_USERS = "1"        
const QUESTIONS_SOLVED = "0"   

function formatCount(num: number): string {
  if (num >= 1000) return (num / 1000).toFixed(1) + "k"
  return num.toString()
}

export function StatsSection() {
  const [githubStars, setGithubStars] = useState("...")

  useEffect(() => {
    fetch(`https://api.github.com/repos/${GITHUB_USERNAME}/${GITHUB_REPO}`)
      .then(res => res.json())
      .then(data => {
        const stars = data.stargazers_count 
          ? formatCount(data.stargazers_count) 
          : "2.5k"
        setGithubStars(stars)
      })
      .catch(() => setGithubStars("2.5k"))
  }, [])

  const stats = [
    { key: "stars", value: githubStars, label: "GitHub Stars", icon: Star },
    { key: "linkedin", value: LINKEDIN_COUNT, label: "Followers", icon: Linkedin },
    { key: "users", value: ACTIVE_USERS, label: "Active Devs", icon: Users },
    { key: "solved", value: QUESTIONS_SOLVED, label: "Solved", icon: Terminal },
  ]

  return (
    <div className="w-full">
      <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
        {stats.map((item, index) => {
          const Icon = item.icon
          return (
            <motion.div
              key={item.key}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 + (index * 0.1) }}
              className="flex flex-col items-center justify-center gap-2"
            >
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-[#2C7FFF]/10 text-[#2C7FFF]">
                <Icon className="h-5 w-5" />
              </div>
              
              <div className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                {item.value}
              </div>
              
              <div className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                {item.label}
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}