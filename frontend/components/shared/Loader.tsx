'use client';

import { useEffect, useRef } from 'react';

import { cn } from '@/lib/utils';

interface LoaderProps {
  className?: string;
  size?: number;
}

interface ParticleState {
  x: number;
  y: number;
  angle: number;
  speed: number;
  accel: number;
  radius: number;
  decay: number;
  life: number;
}

const TWO_PI = Math.PI * 2;

export function Loader({ className, size = 240 }: LoaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<ParticleState[]>([]);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = size;
    const height = size;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'lighter';

    const particles = particlesRef.current;
    const min = width * 0.5;
    let globalAngle = 0;
    let tick = 0;
    let lastFrame = 0;

    const spawnParticle = () => {
      particles.push({
        x: width / 2 + Math.cos(tick / 20) * (min / 2),
        y: height / 2 + Math.sin(tick / 20) * (min / 2),
        angle: globalAngle,
        speed: 0,
        accel: 0.012,
        radius: 7,
        decay: 0.012,
        life: 1,
      });
    };

    const step = () => {
      spawnParticle();
      spawnParticle();

      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const p = particles[i];
        p.speed += p.accel;
        p.x += Math.cos(p.angle) * p.speed;
        p.y += Math.sin(p.angle) * p.speed;
        p.angle += Math.PI / 64;
        p.accel *= 1.01;
        p.life -= p.decay;

        if (p.life <= 0) {
          particles.splice(i, 1);
        }
      }

      globalAngle += Math.PI / 3.2;
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      particles.forEach((p, i) => {
        const hue = 300 - (1 - p.life) * 120;
        const alpha = Math.max(0, p.life);
        ctx.fillStyle = `hsla(${hue}, 100%, 60%, ${alpha})`;
        ctx.strokeStyle = `hsla(${hue}, 100%, 60%, ${alpha})`;

        if (particles[i - 1]) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(particles[i - 1].x, particles[i - 1].y);
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.001, p.life * p.radius), 0, TWO_PI);
        ctx.fill();

        const sparkle = Math.random() * 1.2;
        ctx.fillRect(
          Math.round(p.x + (Math.random() - 0.5) * 35 * p.life),
          Math.round(p.y + (Math.random() - 0.5) * 35 * p.life),
          sparkle,
          sparkle
        );
      });
    };

    const loop = (timestamp: number) => {
      animationRef.current = requestAnimationFrame(loop);
      if (!lastFrame) lastFrame = timestamp;
      const frameDiff = timestamp - lastFrame;
      if (frameDiff < 1000 / 60) return;
      lastFrame = timestamp;
      step();
      draw();
      tick += 1;
    };

    animationRef.current = requestAnimationFrame(loop);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [size]);

  return (
    <div
      className={cn('relative flex items-center justify-center', className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="block" />
    </div>
  );
}
