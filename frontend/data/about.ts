import { Twitter, Linkedin, Github } from "lucide-react"

export const TESTIMONIALS = [
  {
    name: "Alex Chen",
    role: "Frontend @ Meta",
    avatar: "AC",
    content: "Cheap therapy for React devs.",
    platform: "Twitter",
    icon: Twitter,
    color: "text-sky-500 bg-sky-500/10"
  },
  {
    name: "Sarah J.",
    role: "Senior SWE @ Google",
    avatar: "SJ",
    content: "Harder than my actual interview. 10/10.",
    platform: "LinkedIn",
    icon: Linkedin,
    color: "text-blue-600 bg-blue-600/10"
  },
  {
    name: "git_push_force",
    role: "Open Source Contributor",
    avatar: "GP",
    content: "Found a bug in the quiz, reported it, got points. Now I'm addicted to fixing your typos.",
    platform: "GitHub",
    icon: Github,
    color: "text-gray-900 dark:text-white bg-gray-500/10"
  },
  {
    name: "Emily Park",
    role: "Full Stack @ Vercel",
    avatar: "EP",
    content: "This is the only place where 'centering a div' is explained like I'm 5. Bless you.",
    platform: "Twitter",
    icon: Twitter,
    color: "text-sky-500 bg-sky-500/10"
  },
  {
    name: "David Kim",
    role: "Staff Engineer @ Netflix",
    avatar: "DK",
    content: "I use the Q&A section to win arguments with my juniors. Don't tell them.",
    platform: "LinkedIn",
    icon: Linkedin,
    color: "text-blue-600 bg-blue-600/10"
  },
]

export const TOPICS = [
        {
        id: "git",
        name: "Git & Version Control",
        questions: "90+ Questions",
        icon: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/git/git-original.svg",
        color: "group-hover:border-[#F05032]/50 group-hover:bg-[#F05032]/10",
        glow: "bg-[#F05032]",
        href: "/q&a" 
    },
    {
        id: "html",
        name: "HTML5 & Semantic",
        questions: "120+ Questions",
        icon: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/html5/html5-original.svg",
        color: "group-hover:border-[#E34F26]/50 group-hover:bg-[#E34F26]/10",
        glow: "bg-[#E34F26]",
        href: "/q&a/?category=html"
    },
    {
        id: "css",
        name: "CSS3 & Responsive",
        questions: "180+ Questions",
        icon: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/css3/css3-original.svg",
        color: "group-hover:border-[#1572B6]/50 group-hover:bg-[#1572B6]/10",
        glow: "bg-[#1572B6]",
        href: "/q&a/?category=css"
    },
    {
        id: "js",
        name: "JavaScript (ES6+)",
        questions: "450+ Questions",
        icon: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/javascript/javascript-original.svg",
        color: "group-hover:border-[#F7DF1E]/50 group-hover:bg-[#F7DF1E]/10",
        glow: "bg-[#F7DF1E]",
        href: "/q&a/?category=javascript"
    },
    {
        id: "ts",
        name: "TypeScript",
        questions: "210+ Questions",
        icon: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/typescript/typescript-original.svg",
        color: "group-hover:border-[#3178C6]/50 group-hover:bg-[#3178C6]/10",
        glow: "bg-[#3178C6]",
        href: "/q&a/?category=typescript"
    },
    {
        id: "react",
        name: "React.js Ecosystem",
        questions: "320+ Questions",
        icon: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/react/react-original.svg",
        color: "group-hover:border-[#61DAFB]/50 group-hover:bg-[#61DAFB]/10",
        glow: "bg-[#61DAFB]",
        href: "/q&a/?category=react"
    },
    {
        id: "next",
        name: "Next.js & SSR",
        questions: "140+ Questions",
        icon: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/nextjs/nextjs-original.svg",
        color: "group-hover:border-black/50 dark:group-hover:border-white/50 group-hover:bg-black/5 dark:group-hover:bg-white/10",
        glow: "bg-black dark:bg-white",
        className: "dark:invert",
        href: "/q&a/?category=next"
    },
    {
        id: "vue",
        name: "Vue.js",
        questions: "110+ Questions",
        icon: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/vuejs/vuejs-original.svg",
        color: "group-hover:border-[#4FC08D]/50 group-hover:bg-[#4FC08D]/10",
        glow: "bg-[#4FC08D]",
        href: "/q&a/?category=vue"
    },
    {
        id: "angular",
        name: "Angular",
        questions: "95+ Questions",
        icon: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/angularjs/angularjs-original.svg",
        color: "group-hover:border-[#DD0031]/50 group-hover:bg-[#DD0031]/10",
        glow: "bg-[#DD0031]",
        href: "/q&a/?category=angular"
    },
    {
        id: "node",
        name: "Node.js & Backend",
        questions: "150+ Questions",
        icon: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/nodejs/nodejs-original.svg",
        color: "group-hover:border-[#339933]/50 group-hover:bg-[#339933]/10",
        glow: "bg-[#339933]",
        href: "/q&a/?category=node"
    },
]