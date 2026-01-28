"use client"

import { useEffect, useRef } from "react"

interface ParticleCanvasProps {
  activeShape: "brackets" | "heart" | null
  className?: string
}

interface Point {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  floatX: number
  floatY: number
  floatVx: number
  floatVy: number
}

interface Point3D {
  x: number
  y: number
  z: number
}

// Generate Code Brackets {} shape
function generateBracketsPoints(count: number): Point3D[] {
  const points: Point3D[] = []
  const halfCount = Math.floor(count / 2)

  const generateBrace = (flipX: boolean) => {
    for (let i = 0; i < halfCount; i++) {
      const t = (i / halfCount) * Math.PI * 2 - Math.PI

      let x: number
      let y: number

      if (t < -Math.PI / 2) {
        const localT = (t + Math.PI) / (Math.PI / 2)
        x = 0.3 * Math.cos(localT * Math.PI / 2)
        y = -0.8 + 0.3 * Math.sin(localT * Math.PI / 2)
      } else if (t < 0) {
        const localT = (t + Math.PI / 2) / (Math.PI / 2)
        x = 0.3 - 0.5 * localT
        y = -0.5 + 0.5 * localT
      } else if (t < Math.PI / 2) {
        const localT = t / (Math.PI / 2)
        x = -0.2 + 0.5 * localT
        y = 0.5 * localT
      } else {
        const localT = (t - Math.PI / 2) / (Math.PI / 2)
        x = 0.3 * Math.cos((1 - localT) * Math.PI / 2)
        y = 0.5 + 0.3 * (1 - Math.cos(localT * Math.PI / 2))
      }

      const z = (Math.random() - 0.5) * 0.3
      const finalX = flipX ? -x + 0.6 : x - 0.6

      points.push({
        x: finalX + (Math.random() - 0.5) * 0.05,
        y: y + (Math.random() - 0.5) * 0.05,
        z: z,
      })
    }
  }

  generateBrace(false)
  generateBrace(true)
  return points
}

// Generate 3D Heart shape
function generateHeartPoints(count: number): Point3D[] {
  const points: Point3D[] = []
  const layers = 8
  const pointsPerLayer = Math.floor(count / layers)

  for (let layer = 0; layer < layers; layer++) {
    const depthRatio = layer / (layers - 1)
    const z = (depthRatio - 0.5) * 0.6
    const layerScale = 1 - Math.abs(depthRatio - 0.5) * 0.3

    for (let i = 0; i < pointsPerLayer; i++) {
      const t = (i / pointsPerLayer) * Math.PI * 2
      const x = 16 * Math.pow(Math.sin(t), 3)
      const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))

      points.push({
        x: (x / 17) * layerScale + (Math.random() - 0.5) * 0.08,
        y: (y / 17) * layerScale + (Math.random() - 0.5) * 0.08,
        z: z + (Math.random() - 0.5) * 0.08,
      })
    }
  }
  return points
}

const SHAPE_POINTS_BRACKETS = generateBracketsPoints(800)
const SHAPE_POINTS_HEART = generateHeartPoints(800)

// Smooth ease in-out
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

export function ParticleCanvas({ activeShape, className }: ParticleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particles = useRef<Point[]>([])
  const animationFrameId = useRef<number | undefined>(undefined)
  const timeRef = useRef(0)

  // Simple transition: 0 = floating, 1 = shape
  const transitionRef = useRef(0)
  const targetTransitionRef = useRef(0)
  const prevShapeRef = useRef<"brackets" | "heart" | null>(null)
  const justLeftShapeRef = useRef(false)
  const activeShapeRef = useRef<"brackets" | "heart" | null>(activeShape)

  const getThemeColors = () => {
    const isDark = document.documentElement.classList.contains("dark")
    return {
      isDark,
      r: isDark ? 255 : 30,
      g: isDark ? 45 : 94,
      b: isDark ? 85 : 255,
    }
  }

  useEffect(() => {
    activeShapeRef.current = activeShape
    const wasInShape = targetTransitionRef.current === 1
    targetTransitionRef.current = activeShape ? 1 : 0
    if (activeShape) {
      prevShapeRef.current = activeShape
      justLeftShapeRef.current = false
    } else if (wasInShape) {
      justLeftShapeRef.current = true
      // Gentle nudge instead of hard push
      particles.current.forEach(p => {
        p.vx *= 0.5
        p.vy *= 0.5
      })
    }
  }, [activeShape])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const resizeCanvas = () => {
      canvas.width = canvas.parentElement?.offsetWidth || window.innerWidth
      canvas.height = canvas.parentElement?.offsetHeight || window.innerHeight
      initParticles(canvas.width, canvas.height)
    }

    const initParticles = (width: number, height: number) => {
      const count = 800
      particles.current = []

      for (let i = 0; i < count; i++) {
        const floatX = Math.random() * width
        const floatY = Math.random() * height
        
        const speed = 0.2 + Math.random() * 0.3
        const angle = Math.random() * Math.PI * 2

        particles.current.push({
          x: floatX,
          y: floatY,
          z: 0,
          vx: 0,
          vy: 0,
          vz: 0,
          floatX,
          floatY,
          floatVx: Math.cos(angle) * speed,
          floatVy: Math.sin(angle) * speed,
        })
      }
    }

    const draw = () => {
      if (!canvas || !ctx) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      timeRef.current += 0.016

      // Linear transition - no initial freeze
      const inSpeed = 0.012
      const outSpeed = 0.006 // Slower out
      if (targetTransitionRef.current > transitionRef.current) {
        // Going IN
        transitionRef.current = Math.min(targetTransitionRef.current, transitionRef.current + inSpeed)
      } else if (targetTransitionRef.current < transitionRef.current) {
        // Going OUT - slow and smooth
        transitionRef.current = Math.max(targetTransitionRef.current, transitionRef.current - outSpeed)
      }

      // Apply smooth easing
      const rawProgress = Math.max(0, Math.min(1, transitionRef.current))
      const progress = easeInOutCubic(rawProgress)

      const { r, g, b, isDark } = getThemeColors()

      const isMobileView = canvas.width < 768

      const currentShape = activeShapeRef.current || prevShapeRef.current
      const shapePoints =
        currentShape === "brackets"
          ? SHAPE_POINTS_BRACKETS
          : currentShape === "heart"
            ? SHAPE_POINTS_HEART
            : null

      // 3D rotation - always moving
      const angle = timeRef.current * 0.4
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)

      particles.current.forEach((p, i) => {
        // Always update floating positions
        p.floatX += p.floatVx
        p.floatY += p.floatVy

        if (p.floatX < 0 || p.floatX > canvas.width) {
          p.floatVx *= -1
          p.floatX = Math.max(0, Math.min(canvas.width, p.floatX))
        }
        if (p.floatY < 0 || p.floatY > canvas.height) {
          p.floatVy *= -1
          p.floatY = Math.max(0, Math.min(canvas.height, p.floatY))
        }

        // Calculate shape position
        let shapeX = p.floatX
        let shapeY = p.floatY

        if (isMobileView) {
          // Mobile: show both shapes - first half brackets, second half heart
          const halfCount = Math.floor(particles.current.length / 2)
          const isFirstHalf = i < halfCount
          const localIndex = isFirstHalf ? i : i - halfCount
          const mobileShapePoints = isFirstHalf ? SHAPE_POINTS_BRACKETS : SHAPE_POINTS_HEART
          const shapePoint = mobileShapePoints[localIndex % mobileShapePoints.length]
          
          const rotatedX = shapePoint.x * cos - shapePoint.z * sin
          const rotatedZ = shapePoint.x * sin + shapePoint.z * cos
          const rotatedY = shapePoint.y
          const perspective = 3
          const scale = perspective / (perspective + rotatedZ)
          const shapeScale = Math.min(canvas.width, canvas.height) * 0.7
          
          // Position: centered on each card
          const centerX = canvas.width / 2
          const centerY = isFirstHalf ? canvas.height * 0.32 : canvas.height * 0.68
          
          shapeX = centerX + rotatedX * shapeScale * scale
          shapeY = centerY + rotatedY * shapeScale * scale
        } else if (shapePoints) {
          // Desktop: original hover behavior
          let centerX = canvas.width / 2
          const centerY = canvas.height / 2
          if (currentShape === "brackets") centerX = canvas.width * 0.25
          if (currentShape === "heart") centerX = canvas.width * 0.75
          
          const shapePoint = shapePoints[i % shapePoints.length]
          const rotatedX = shapePoint.x * cos - shapePoint.z * sin
          const rotatedZ = shapePoint.x * sin + shapePoint.z * cos
          const rotatedY = shapePoint.y
          const perspective = 3
          const scale = perspective / (perspective + rotatedZ)
          const shapeScale = Math.min(canvas.width, canvas.height) * 0.35
          shapeX = centerX + rotatedX * shapeScale * scale
          shapeY = centerY + rotatedY * shapeScale * scale
        }

        // Target position - on mobile always full shape, on desktop based on hover progress
        const effectiveProgress = isMobileView ? 1 : progress
        const targetX = p.floatX + (shapeX - p.floatX) * effectiveProgress
        const targetY = p.floatY + (shapeY - p.floatY) * effectiveProgress

        // Smooth spring physics - gentle force, high damping
        const springForce = 0.04 // Gentle spring
        const damping = 0.92 // High damping for smooth motion
        
        // Add spring force toward target
        p.vx += (targetX - p.x) * springForce
        p.vy += (targetY - p.y) * springForce
        
        // Apply damping
        p.vx *= damping
        p.vy *= damping
        
        // Update position
        p.x += p.vx
        p.y += p.vy

        // Alpha - on mobile always visible, on desktop based on progress
        const alpha = isMobileView ? 0.3 : (0.15 + 0.45 * progress)

        ctx.beginPath()
        ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`
        ctx.fill()
      })

      // Connecting lines when in shape
      if (progress > 0.5 && shapePoints) {
        const lineAlpha = (progress - 0.5) * 0.2
        ctx.globalAlpha = lineAlpha
        ctx.lineWidth = 0.5
        ctx.strokeStyle = isDark ? "#ff2d55" : "#1e5eff"
        ctx.beginPath()

        for (let i = 0; i < particles.current.length; i += 4) {
          const p1 = particles.current[i]
          for (let j = 1; j <= 4; j++) {
            const p2 = particles.current[(i + j) % particles.current.length]
            const distSq = (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2
            if (distSq < 35 * 35) {
              ctx.moveTo(p1.x, p1.y)
              ctx.lineTo(p2.x, p2.y)
            }
          }
        }
        ctx.stroke()
        ctx.globalAlpha = 1.0
      }

      animationFrameId.current = requestAnimationFrame(draw)
    }

    resizeCanvas()
    window.addEventListener("resize", resizeCanvas)
    draw()

    return () => {
      window.removeEventListener("resize", resizeCanvas)
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current)
    }
  }, [])

  return <canvas ref={canvasRef} className={className} />
}
