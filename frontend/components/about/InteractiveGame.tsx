"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Heart, Bug, Play, X, RotateCcw, Zap, Skull, Rabbit } from "lucide-react"

const GAME_WIDTH_DESKTOP = 540
const GAME_WIDTH_MOBILE = 320
const IDLE_WIDTH_DESKTOP = 280
const IDLE_WIDTH_MOBILE = 240

const GROUND_Y_DESKTOP = 32
const GROUND_Y_MOBILE = 24
const PLAYER_X_DESKTOP = 64
const PLAYER_X_MOBILE = 40
const PLAYER_SIZE_DESKTOP = 40
const PLAYER_SIZE_MOBILE = 32
const JUMP_HEIGHT_DESKTOP = 90
const JUMP_HEIGHT_MOBILE = 70
const JUMP_DURATION = 500

type ObstacleType = 'ground' | 'flying' | 'fast' | 'tall'

interface Obstacle {
    type: ObstacleType
    x: number
    size: number
    heightOffset: number
    speedMultiplier: number
}

const OBSTACLE_CONFIGS: Record<ObstacleType, Omit<Obstacle, 'x'>> = {
    ground: { type: 'ground', size: 32, heightOffset: 0, speedMultiplier: 1 },
    flying: { type: 'flying', size: 28, heightOffset: 45, speedMultiplier: 1 },
    fast: { type: 'fast', size: 24, heightOffset: 0, speedMultiplier: 1.2 },
    tall: { type: 'tall', size: 38, heightOffset: 0, speedMultiplier: 0.95 },
}

const LEVEL_THRESHOLDS = [
    { score: 0, types: ['ground'] as ObstacleType[], name: 'Level 1', baseSpeed: 3.5 },
    { score: 8, types: ['ground', 'fast'] as ObstacleType[], name: 'Level 2', baseSpeed: 4 },
    { score: 18, types: ['ground', 'fast', 'flying'] as ObstacleType[], name: 'Level 3', baseSpeed: 4.5 },
    { score: 30, types: ['ground', 'fast', 'flying', 'tall'] as ObstacleType[], name: 'Level 4', baseSpeed: 5 },
]

function getBaseSpeed(score: number): number {
    let speed = 3.5
    for (const level of LEVEL_THRESHOLDS) {
        if (score >= level.score) {
            speed = level.baseSpeed
        }
    }
    return speed
}

function getAvailableTypes(score: number): ObstacleType[] {
    let types: ObstacleType[] = ['ground']
    for (const level of LEVEL_THRESHOLDS) {
        if (score >= level.score) {
            types = level.types
        }
    }
    return types
}

function getCurrentLevel(score: number): string {
    let name = 'Level 1'
    for (const level of LEVEL_THRESHOLDS) {
        if (score >= level.score) {
            name = level.name
        }
    }
    return name
}

function getRandomObstacle(score: number, gameWidth: number): Obstacle {
    const types = getAvailableTypes(score)
    let selectedType: ObstacleType
    const rand = Math.random()

    if (types.length === 1) {
        selectedType = 'ground'
    } else if (types.length === 2) {
        selectedType = rand < 0.7 ? 'ground' : types[1]
    } else if (types.length === 3) {
        if (rand < 0.5) selectedType = 'ground'
        else if (rand < 0.75) selectedType = types[1]
        else selectedType = types[2]
    } else {
        if (rand < 0.4) selectedType = 'ground'
        else if (rand < 0.6) selectedType = types[1]
        else if (rand < 0.8) selectedType = types[2]
        else selectedType = types[3]
    }

    return {
        ...OBSTACLE_CONFIGS[selectedType],
        x: gameWidth + 40,
    }
}

export function InteractiveGame() {
    const [mode, setMode] = useState<'idle' | 'preview' | 'playing'>('idle')
    const [gameOver, setGameOver] = useState(false)
    const [score, setScore] = useState(0)
    const [levelUpFlash, setLevelUpFlash] = useState(false)
    const [isMobile, setIsMobile] = useState(false)

    const gameWidth = isMobile ? GAME_WIDTH_MOBILE : GAME_WIDTH_DESKTOP
    const idleWidth = isMobile ? IDLE_WIDTH_MOBILE : IDLE_WIDTH_DESKTOP
    const playerX = isMobile ? PLAYER_X_MOBILE : PLAYER_X_DESKTOP
    const groundY = isMobile ? GROUND_Y_MOBILE : GROUND_Y_DESKTOP
    const playerSize = isMobile ? PLAYER_SIZE_MOBILE : PLAYER_SIZE_DESKTOP
    const jumpHeight = isMobile ? JUMP_HEIGHT_MOBILE : JUMP_HEIGHT_DESKTOP
    const obstacleEndX = -60

    const [highScore, setHighScore] = useState(0)

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 640)
        checkMobile()
        window.addEventListener('resize', checkMobile)
        return () => window.removeEventListener('resize', checkMobile)
    }, [])

    useEffect(() => {
        const saved = localStorage.getItem('devlovers_highscore')
        if (saved) setHighScore(parseInt(saved, 10))
    }, [])

    const [playerY, setPlayerY] = useState(0)
    const [obstacle, setObstacle] = useState<Obstacle>(() => getRandomObstacle(0, GAME_WIDTH_DESKTOP))
    const [gameSpeed, setGameSpeed] = useState(3.5)

    const isJumpingRef = useRef(false)
    const jumpStartTime = useRef(0)
    const lastTimeRef = useRef(0)
    const requestRef = useRef<number | null>(null)
    const pillRef = useRef<HTMLDivElement>(null)
    const hasPassedRef = useRef(false)
    const prevLevelRef = useRef('Level 1')

    const exitGame = useCallback(() => {
        setMode('idle')
        setGameOver(false)
        setScore(0)
        setPlayerY(0)
        setObstacle(getRandomObstacle(0, gameWidth))
        setGameSpeed(3.5)
        isJumpingRef.current = false
        hasPassedRef.current = false
        prevLevelRef.current = 'Level 1'
        if (requestRef.current !== null) cancelAnimationFrame(requestRef.current)
    }, [gameWidth])

    const handleRetry = useCallback(() => {
        setGameOver(false)
        setScore(0)
        setPlayerY(0)
        setObstacle(getRandomObstacle(0, gameWidth))
        setGameSpeed(3.5)
        isJumpingRef.current = false
        hasPassedRef.current = false
        lastTimeRef.current = 0
        prevLevelRef.current = 'Level 1'
    }, [gameWidth])

    const handleGameOver = useCallback((finalScore: number) => {
        setGameOver(true)
        if (finalScore > highScore) {
            setHighScore(finalScore)
            localStorage.setItem('devlovers_highscore', finalScore.toString())
        }
    }, [highScore])

    const jump = useCallback(() => {
        if (!isJumpingRef.current && mode === 'playing' && !gameOver) {
            isJumpingRef.current = true
            jumpStartTime.current = performance.now()
        }
    }, [mode, gameOver])

    useEffect(() => {
        const currentLevel = getCurrentLevel(score)
        if (currentLevel !== prevLevelRef.current && score > 0) {
            prevLevelRef.current = currentLevel
            setLevelUpFlash(true)
            setTimeout(() => setLevelUpFlash(false), 500)
        }
    }, [score])

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
                if (gameOver) {
                    handleRetry()
                } else {
                    jump()
                }
            }
            if (e.code === "Escape") exitGame()
        }
        window.addEventListener("keydown", handleKeyDown)
        return () => window.removeEventListener("keydown", handleKeyDown)
    }, [mode, gameOver, jump, handleRetry, exitGame])

    useEffect(() => {
        if (mode !== 'playing' || gameOver) {
            if (requestRef.current !== null) cancelAnimationFrame(requestRef.current)
            return
        }

        const gameLoop = (currentTime: number) => {
            if (lastTimeRef.current === 0) {
                lastTimeRef.current = currentTime
            }

            const deltaTime = (currentTime - lastTimeRef.current) / 1000
            lastTimeRef.current = currentTime

            let newPlayerY = 0
            if (isJumpingRef.current) {
                const jumpElapsed = currentTime - jumpStartTime.current
                const jumpProgress = jumpElapsed / JUMP_DURATION

                if (jumpProgress >= 1) {
                    isJumpingRef.current = false
                    newPlayerY = 0
                } else {
                    newPlayerY = jumpHeight * Math.sin(jumpProgress * Math.PI)
                }
            }
            setPlayerY(newPlayerY)

            setObstacle(prevObstacle => {
                const effectiveSpeed = gameSpeed * prevObstacle.speedMultiplier
                let newX = prevObstacle.x - effectiveSpeed * deltaTime * 100
                const obstacleRight = newX + prevObstacle.size

                if (!hasPassedRef.current && obstacleRight < playerX) {
                    hasPassedRef.current = true
                    setScore(s => {
                        const newScore = s + 1
                        const newBaseSpeed = getBaseSpeed(newScore)
                        setGameSpeed(newBaseSpeed)
                        return newScore
                    })
                }

                if (newX < obstacleEndX) {
                    hasPassedRef.current = false
                    return getRandomObstacle(score, gameWidth)
                }

                return { ...prevObstacle, x: newX }
            })

            setObstacle(currentObstacle => {
                const pLeft = playerX + 8
                const pRight = playerX + playerSize - 8
                const playerBottom = groundY + newPlayerY
                const playerTop = playerBottom + playerSize - 8

                const oLeft = currentObstacle.x + 6
                const oRight = currentObstacle.x + currentObstacle.size - 6
                const obstacleBottom = groundY + currentObstacle.heightOffset
                const obstacleTop = obstacleBottom + currentObstacle.size - 4

                const isColliding =
                    pRight > oLeft &&
                    pLeft < oRight &&
                    playerBottom < obstacleTop &&
                    playerTop > obstacleBottom

                if (isColliding) {
                    setScore(s => {
                        handleGameOver(s)
                        return s
                    })
                }

                return currentObstacle
            })

            requestRef.current = requestAnimationFrame(gameLoop)
        }

        lastTimeRef.current = 0
        requestRef.current = requestAnimationFrame(gameLoop)

        return () => {
            if (requestRef.current !== null) cancelAnimationFrame(requestRef.current)
        }
    }, [mode, gameOver, gameSpeed, handleGameOver, score, playerX, obstacleEndX, gameWidth, groundY, playerSize, jumpHeight])

    const renderObstacle = (obs: Obstacle) => {
        const baseClasses = "transition-colors"

        switch (obs.type) {
            case 'flying':
                return (
                    <div className="relative">
                        <Bug
                            className={`${baseClasses} text-purple-500 dark:text-purple-400`}
                            style={{ width: obs.size, height: obs.size }}
                        />
                        <div className="absolute -inset-1 bg-purple-500/20 blur-md rounded-full" />
                    </div>
                )
            case 'fast':
                return (
                    <div className="relative">
                        <Rabbit
                            className={`${baseClasses} text-orange-500 dark:text-orange-400`}
                            style={{ width: obs.size, height: obs.size }}
                        />
                    </div>
                )
            case 'tall':
                return (
                    <div className="relative">
                        <Skull
                            className={`${baseClasses} text-red-600 dark:text-red-500`}
                            style={{ width: obs.size, height: obs.size }}
                        />
                        <div className="absolute -inset-1 bg-red-500/20 blur-md rounded-full" />
                    </div>
                )
            default:
                return (
                    <Bug
                        className={`${baseClasses} text-neutral-600 dark:text-neutral-400 opacity-90`}
                        style={{ width: obs.size, height: obs.size }}
                    />
                )
        }
    }

    return (
        <motion.div
            ref={pillRef}
            layout
            transition={{ type: "spring", stiffness: 180, damping: 24 }}
            animate={{
                width: mode === 'idle' ? idleWidth : gameWidth,
                height: mode === 'idle' ? 56 : (isMobile ? 180 : 240),
                borderRadius: mode === 'idle' ? "9999px" : (isMobile ? "20px" : "24px")
            }}
            onHoverStart={() => mode === 'idle' && setMode('preview')}
            onHoverEnd={() => mode === 'preview' && setMode('idle')}
            className="relative mb-8 md:mb-14 select-none border border-neutral-200/50 dark:border-white/10 bg-white/40 dark:bg-white/5 backdrop-blur-md shadow-xl z-50 mx-auto group overflow-hidden"
            onClick={() => mode !== 'playing' && setMode('playing')}
        >
            <AnimatePresence>
                {levelUpFlash && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="absolute inset-0 z-50 bg-[#ff005b]/20 pointer-events-none"
                    />
                )}
            </AnimatePresence>

            <AnimatePresence mode="wait">
                {mode === 'idle' ? (
                    <motion.div
                        key="idle"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="flex items-center justify-between w-full h-full px-4 md:px-6"
                    >
                        <div className="flex items-center gap-2 md:gap-3">
                            <Heart className="h-4 w-4 md:h-5 md:w-5 fill-[#ff005b] text-[#ff005b]" strokeWidth={0} />
                            <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-[0.15em] md:tracking-[0.2em] text-neutral-600 dark:text-neutral-300">
                                DevLovers Arcade
                            </span>
                        </div>
                        <div className="flex items-center gap-2 opacity-50">
                            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                            <span className="text-[8px] md:text-[9px] font-mono text-neutral-400">READY</span>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        key="active"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.15 } }}
                        className="flex flex-col h-full w-full"
                    >
                        <div className="flex justify-between items-center px-3 md:px-6 py-2 md:py-3 border-b border-neutral-200/30 dark:border-white/5 bg-white/30 dark:bg-white/5">
                            <div className="hidden md:flex items-center gap-3">
                                <div className={`h-2 w-2 rounded-full ${mode === 'playing' && !gameOver ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-red-500'}`} />
                                <div className="flex flex-col">
                                    <span className="text-[8px] font-mono font-bold text-neutral-400 uppercase tracking-wider">
                                        {getCurrentLevel(score)}
                                    </span>
                                    <span className="text-[10px] font-bold text-neutral-700 dark:text-white leading-none">
                                        {gameOver ? "CRASHED" : "RUNNING"}
                                    </span>
                                </div>
                            </div>

                            <div className="flex md:hidden items-center gap-2">
                                <div className={`h-2 w-2 rounded-full ${mode === 'playing' && !gameOver ? 'bg-green-500' : 'bg-red-500'}`} />
                                <span className="text-[8px] font-mono font-bold text-neutral-400 uppercase">
                                    {getCurrentLevel(score)}
                                </span>
                            </div>

                            <div className="flex items-center gap-3 md:gap-6 md:absolute md:left-1/2 md:-translate-x-1/2">
                                <div className="flex flex-col items-center">
                                    <span className="text-[7px] md:text-[8px] font-bold text-neutral-400 uppercase tracking-widest">High</span>
                                    <span suppressHydrationWarning className="font-mono text-[10px] md:text-xs font-bold text-neutral-500">
                                        {highScore.toString().padStart(3, '0')}
                                    </span>
                                </div>
                                <div className="w-[1px] h-3 md:h-4 bg-neutral-300 dark:bg-white/20" />
                                <div className="flex flex-col items-center">
                                    <span className="text-[7px] md:text-[8px] font-bold text-[#ff005b] uppercase tracking-widest">Score</span>
                                    <span className="font-mono text-sm md:text-lg font-black text-neutral-800 dark:text-white leading-none">
                                        {score.toString().padStart(3, '0')}
                                    </span>
                                </div>
                            </div>

                            <button onClick={(e) => {e.stopPropagation(); exitGame();}} className="p-1.5 md:p-2 -mr-1 md:-mr-2 hover:text-[#ff005b] transition-colors">
                                <X size={14} className="md:w-4 md:h-4 text-neutral-400" />
                            </button>
                        </div>

                        <div
                            className="relative flex-1 w-full overflow-hidden cursor-pointer"
                            onClick={mode === 'playing' && !gameOver ? jump : undefined}
                        >
                            <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808015_1px,transparent_1px),linear-gradient(to_bottom,#80808015_1px,transparent_1px)] bg-[size:40px_40px]" />

                            <div
                                className="absolute z-10 transition-transform"
                                style={{
                                    left: playerX,
                                    bottom: groundY + playerY,
                                    transform: playerY > 10 ? 'rotate(-15deg) scale(0.95)' : 'rotate(0deg) scale(1)',
                                    transition: 'transform 0.1s ease-out'
                                }}
                            >
                                <div className="relative">
                                    <div className="absolute -inset-4 bg-[#ff005b]/20 blur-xl rounded-full opacity-50" />
                                    <Heart
                                        className="relative fill-[#ff005b] text-[#ff005b] drop-shadow-sm"
                                        strokeWidth={0}
                                        style={{ width: playerSize, height: playerSize }}
                                    />
                                </div>
                            </div>

                            {mode === 'playing' && (
                                <div
                                    className="absolute z-10"
                                    style={{
                                        left: obstacle.x,
                                        bottom: groundY + obstacle.heightOffset
                                    }}
                                >
                                    {renderObstacle(obstacle)}
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

                            <div className="absolute w-full h-[1px] bg-neutral-300 dark:bg-white/10" style={{ bottom: groundY }} />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    )
}
