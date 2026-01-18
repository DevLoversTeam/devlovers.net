"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Heart, Bug, Play, X, RotateCcw, Zap } from "lucide-react"

export function InteractiveGame() {
    const [mode, setMode] = useState<'idle' | 'preview' | 'playing'>('idle')
    const [gameOver, setGameOver] = useState(false)
    const [score, setScore] = useState(0)
    
    const [highScore, setHighScore] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('devlovers_highscore')
            return saved ? parseInt(saved, 10) : 0
        }
        return 0
    })

    const [isJumping, setIsJumping] = useState(false)
    const [gameSpeed, setGameSpeed] = useState(1.8) 
    const [resetKey, setResetKey] = useState(0)

    const pillRef = useRef<HTMLDivElement>(null)
    const requestRef = useRef<number | null>(null)
    const playerRef = useRef<HTMLDivElement>(null)
    const obstacleRef = useRef<HTMLDivElement>(null)

    const exitGame = useCallback(() => {
        setMode('idle')
        setGameOver(false)
        setScore(0)
        setGameSpeed(1.8)
        if (requestRef.current !== null) cancelAnimationFrame(requestRef.current)
    }, [])

    const handleRetry = useCallback(() => {
        setGameOver(false)
        setScore(0)
        setGameSpeed(1.8)
        setResetKey(prev => prev + 1)
    }, [])

    const handleGameOver = useCallback(() => {
        setGameOver(true)
        setHighScore(prev => {
            const newHigh = Math.max(prev, score)
            if (typeof window !== 'undefined') {
                localStorage.setItem('devlovers_highscore', newHigh.toString())
            }
            return newHigh
        })
    }, [score])

    const jump = useCallback(() => {
        if (!isJumping && mode === 'playing' && !gameOver) {
            setIsJumping(true)
            setTimeout(() => setIsJumping(false), 550)
        }
    }, [isJumping, mode, gameOver])

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (pillRef.current && !pillRef.current.contains(e.target as Node)) {
                exitGame()
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [exitGame])

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (mode !== 'playing') return
            if (e.code === "Space" || e.code === "ArrowUp") {
                e.preventDefault()
                // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                gameOver ? handleRetry() : jump()
            }
            if (e.code === "Escape") exitGame()
        }
        window.addEventListener("keydown", handleKeyDown)
        return () => window.removeEventListener("keydown", handleKeyDown)
    }, [mode, gameOver, jump, handleRetry, exitGame])

    useEffect(() => {
        if (mode !== 'playing' || gameOver) return

        const checkFrame = () => {
            const player = playerRef.current
            const obstacle = obstacleRef.current

            if (player && obstacle) {
                const p = player.getBoundingClientRect()
                const o = obstacle.getBoundingClientRect()

                const paddingX = 16 
                const paddingY = 12
                
                const isColliding = 
                    p.right - paddingX > o.left + paddingX && 
                    p.left + paddingX < o.right - paddingX && 
                    p.bottom - paddingY > o.top + paddingY

                if (isColliding) {
                    handleGameOver()
                    return 
                }

                setScore(s => {
                    const newScore = s + 1
                    if (newScore % 300 === 0) {
                        setGameSpeed(prev => Math.max(0.7, prev * 0.95))
                    }
                    return newScore
                })
            }
            requestRef.current = requestAnimationFrame(checkFrame)
        }
        requestRef.current = requestAnimationFrame(checkFrame)
        return () => { if (requestRef.current !== null) cancelAnimationFrame(requestRef.current) }
    }, [mode, gameOver, handleGameOver, resetKey])

    return (
        <motion.div
            ref={pillRef}
            layout
            transition={{ type: "spring", stiffness: 180, damping: 24 }}
            animate={{
                width: mode === 'idle' ? 280 : 540,
                height: mode === 'idle' ? 56 : 240,
                borderRadius: mode === 'idle' ? "9999px" : "24px"
            }}
            onHoverStart={() => mode === 'idle' && setMode('preview')}
            onHoverEnd={() => mode === 'preview' && setMode('idle')}
            className="relative mb-14 select-none border border-neutral-200 dark:border-white/10 bg-white/80 dark:bg-[#0a0a0a]/80 backdrop-blur-xl shadow-2xl z-50 mx-auto group overflow-hidden"
            onClick={() => mode !== 'playing' && setMode('playing')}
        >
            <AnimatePresence mode="wait">
                {mode === 'idle' ? (
                    <motion.div 
                        key="idle" 
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="flex items-center justify-between w-full h-full px-6"
                    >
                        <div className="flex items-center gap-3">
                            <Heart className="h-5 w-5 fill-[#ff005b] text-[#ff005b]" strokeWidth={0} />
                            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-600 dark:text-neutral-300">
                                DevLovers Arcade
                            </span>
                        </div>
                        <div className="flex items-center gap-2 opacity-50">
                            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                            <span className="text-[9px] font-mono text-neutral-400">READY</span>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div 
                        key="active" 
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.15 } }} 
                        className="flex flex-col h-full w-full"
                    >
                        <div className="flex justify-between items-center px-6 py-3 border-b border-neutral-100 dark:border-white/5 bg-neutral-50/50 dark:bg-white/5">
                            <div className="flex items-center gap-3">
                                <div className={`h-2 w-2 rounded-full ${mode === 'playing' && !gameOver ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-red-500'}`} />
                                <div className="flex flex-col">
                                    <span className="text-[8px] font-mono font-bold text-neutral-400 uppercase tracking-wider">Status</span>
                                    <span className="text-[10px] font-bold text-neutral-700 dark:text-white leading-none">
                                        {gameOver ? "CRASHED" : "RUNNING"}
                                    </span>
                                </div>
                            </div>
                            
                            <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-6">
                                <div className="flex flex-col items-center">
                                    <span className="text-[8px] font-bold text-neutral-400 uppercase tracking-widest">High</span>
                                    <span suppressHydrationWarning className="font-mono text-xs font-bold text-neutral-500">
                                        {Math.floor(highScore / 5).toString().padStart(4, '0')}
                                    </span>
                                </div>
                                <div className="w-[1px] h-4 bg-neutral-300 dark:bg-white/20" />
                                <div className="flex flex-col items-center">
                                    <span className="text-[8px] font-bold text-[#ff005b] uppercase tracking-widest">Score</span>
                                    <span className="font-mono text-lg font-black text-neutral-800 dark:text-white leading-none">
                                        {Math.floor(score / 5).toString().padStart(5, '0')}
                                    </span>
                                </div>
                            </div>

                            <button onClick={(e) => {e.stopPropagation(); exitGame();}} className="p-2 -mr-2 hover:text-[#ff005b] transition-colors">
                                <X size={16} className="text-neutral-400" />
                            </button>
                        </div>

                        <div className="relative flex-1 w-full overflow-hidden" onClick={mode === 'playing' ? jump : undefined}>
                            
                            <div className="absolute inset-0 opacity-[0.05] dark:opacity-[0.08] bg-[linear-gradient(to_right,#888_1px,transparent_1px),linear-gradient(to_bottom,#888_1px,transparent_1px)] bg-[size:32px_32px]" />
                            
                            <div className="absolute left-16 bottom-8 z-10">
                                <motion.div 
                                    ref={playerRef}
                                    animate={{ 
                                        y: isJumping ? -90 : 0, 
                                        rotate: isJumping ? -15 : 0,
                                        scale: isJumping ? 0.95 : 1
                                    }}
                                    transition={{ type: "spring", stiffness: 600, damping: 28 }}
                                >
                                    <div className="relative">
                                        <div className="absolute -inset-4 bg-[#ff005b]/20 blur-xl rounded-full opacity-50" />
                                        <Heart className="relative h-10 w-10 fill-[#ff005b] text-[#ff005b] drop-shadow-sm" strokeWidth={0}/>
                                    </div>
                                </motion.div>
                            </div>

                            {mode === 'playing' && (
                                <div 
                                    key={resetKey} 
                                    ref={obstacleRef} 
                                    className="absolute bottom-8 z-10"
                                    style={{ 
                                        animationName: 'slide-left',
                                        animationDuration: `${gameSpeed}s`,
                                        animationIterationCount: 'infinite',
                                        animationTimingFunction: 'linear',
                                        animationPlayState: gameOver ? 'paused' : 'running'
                                    }}
                                >
                                    <Bug className="h-8 w-8 text-neutral-600 dark:text-neutral-400 opacity-90" />
                                </div>
                            )}

                            {mode === 'preview' && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                                    <div className="bg-white/90 dark:bg-neutral-800/90 border border-neutral-200 dark:border-white/10 px-5 py-2 rounded-lg shadow-xl flex items-center gap-2">
                                        <Play size={10} fill="currentColor" className="text-[#ff005b]" />
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-800 dark:text-white">Click to Start</span>
                                    </div>
                                </motion.div>
                            )}

                            {gameOver && (
                                <motion.div 
                                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} 
                                    className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-white/60 dark:bg-black/60 backdrop-blur-sm"
                                >
                                    <div className="flex items-center gap-2 mb-4 text-[#ff005b]">
                                        <Zap size={18} fill="currentColor" />
                                        <span className="text-sm font-black uppercase tracking-widest">System Failure</span>
                                    </div>
                                    <div className="flex gap-3">
                                        <button 
                                            onClick={(e) => {e.stopPropagation(); handleRetry();}} 
                                            className="px-6 py-2.5 bg-[#ff005b] text-white text-[10px] font-bold uppercase tracking-widest rounded-lg shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center gap-2"
                                        >
                                            <RotateCcw size={12} /> Retry
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                            
                            <div className="absolute bottom-8 w-full h-[1px] bg-neutral-300 dark:bg-white/10" />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            
            <style jsx global>{`
                @keyframes slide-left {
                    0% { transform: translateX(580px); }
                    100% { transform: translateX(-80px); }
                }
            `}</style>
        </motion.div>
    )
}
