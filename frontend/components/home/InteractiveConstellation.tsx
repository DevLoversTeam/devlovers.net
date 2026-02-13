'use client';

import { useTheme } from 'next-themes';
import React, { useEffect, useRef } from 'react';

interface Point {
  x: number;
  y: number;
}

type IconType = 'react' | 'next' | 'git' | 'code' | 'heart' | 'js' | 'ts' | 'css' | 'node' | 'brackets';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  icon: IconType;
  rotation: number;
  rotationSpeed: number;
}

export function InteractiveConstellation() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef<Point>({ x: -1000, y: -1000 });
  const { theme } = useTheme();

  const icons: Record<IconType, (ctx: CanvasRenderingContext2D, size: number) => void> = {
    react: (ctx, size) => {
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 1.2, size * 0.4, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 1.2, size * 0.4, Math.PI / 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 1.2, size * 0.4, -Math.PI / 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.25, 0, Math.PI * 2);
      ctx.fill();
    },
    next: (ctx, size) => {
        ctx.beginPath();
        ctx.moveTo(-size * 0.6, -size * 0.8);
        ctx.lineTo(-size * 0.6, size * 0.8);
        ctx.lineTo(size * 0.6, -size * 0.8);
        ctx.lineTo(size * 0.6, size * 0.8);
        ctx.lineWidth = 2.5;
        ctx.stroke();
    },
    git: (ctx, size) => {
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, size * 0.9);
        ctx.lineTo(0, -size * 0.9);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, -size * 0.9, size * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(size * 0.7, 0, size * 0.7, -size * 0.5);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(size * 0.7, -size * 0.5, size * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, size * 0.9, size * 0.3, 0, Math.PI * 2);
        ctx.fill();
    },
    code: (ctx, size) => {
        ctx.font = `bold ${size * 1.3}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('</>', 0, 0);
    },
    heart: (ctx, size) => {
        ctx.beginPath();
        ctx.moveTo(0, size * 0.4);
        ctx.bezierCurveTo(
          -size * 0.8, -size * 0.3,
          -size * 1.0, size * 0.2,
          0, size * 1.0
        );
        ctx.bezierCurveTo(
          size * 1.0, size * 0.2,
          size * 0.8, -size * 0.3,
          0, size * 0.4
        );
        ctx.fill();
    },
    js: (ctx, size) => {
       ctx.font = `bold ${size * 1.6}px sans-serif`;
       ctx.textAlign = 'center';
       ctx.textBaseline = 'middle';
       ctx.fillText('JS', 0, 0);
    },
    ts: (ctx, size) => {
       ctx.font = `bold ${size * 1.6}px sans-serif`;
       ctx.textAlign = 'center';
       ctx.textBaseline = 'middle';
       ctx.fillText('TS', 0, 0);
    },
    css: (ctx, size) => {
        ctx.font = `bold ${size * 1.4}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('CSS', 0, 0);
    },
    node: (ctx, size) => {
        ctx.font = `bold ${size * 1.2}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('NODE', 0, 0);
    },
    brackets: (ctx, size) => {
        ctx.font = `bold ${size * 1.8}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('{}', 0, 0);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let particles: Particle[] = [];
    
    const connectionDistance = 140;
    const particleCountFull = 50; 
    const interactionRadius = 220;
    const magneticForce = 0.6; 
    const iconTypes = Object.keys(icons) as IconType[];

    const resize = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      initParticles();
    };

    const initParticles = () => {
      particles = [];
      const density = (canvas.width * canvas.height) / (1920 * 1080);
      const count = Math.floor(particleCountFull * density) || 20;

      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * 0.3, 
          vy: (Math.random() - 0.5) * 0.3,
          size: Math.random() * 8 + 10, 
          icon: iconTypes[Math.floor(Math.random() * iconTypes.length)],
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - 0.5) * 0.02,
        });
      }
    };

    const draw = () => {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Colors
      const isDark = theme === 'dark' || document.documentElement.classList.contains('dark');
      const r = isDark ? 255 : 30;
      const g = isDark ? 45 : 94;
      const b = isDark ? 85 : 255;
      
      const particleColor = `rgba(${r}, ${g}, ${b}, 0.8)`;
      
      particles.forEach((p, i) => {
        const pulse = Math.sin((Date.now() * 0.002) + p.rotation * 5) * 0.5 + 0.5;
        const baseAlpha = 0.4;
        const pulseAlpha = baseAlpha + (pulse * 0.2);

        const dx = mouseRef.current.x - p.x;
        const dy = mouseRef.current.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < interactionRadius) {
            const force = (interactionRadius - dist) / interactionRadius;
             p.vx -= (dx / dist) * force * magneticForce * 0.2;
             p.vy -= (dy / dist) * force * magneticForce * 0.2;
        }

        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const dxCenter = p.x - centerX;
        const dyCenter = p.y - centerY;
        const distCenter = Math.sqrt(dxCenter * dxCenter + dyCenter * dyCenter);
        const centerClearRadius = 450;

        if (distCenter < centerClearRadius) {
            const force = (centerClearRadius - distCenter) / centerClearRadius;
             p.vx += (dxCenter / distCenter) * force * 2.0; 
             p.vy += (dyCenter / distCenter) * force * 2.0;
        }

        for (let j = 0; j < particles.length; j++) {
          if (i === j) continue;
          const p2 = particles[j];
          const dx2 = p.x - p2.x;
          const dy2 = p.y - p2.y;
          const dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
          const minDistance = 60;
          
          if (dist2 < minDistance && dist2 > 0) {
            const repulsionForce = (minDistance - dist2) / minDistance;
            const pushX = (dx2 / dist2) * repulsionForce * 0.5;
            const pushY = (dy2 / dist2) * repulsionForce * 0.5;
            p.vx += pushX;
            p.vy += pushY;
          }
        }

        const mouseInfluenceRadius = 300;
        let alpha = pulseAlpha;
        if (dist < mouseInfluenceRadius) {
            const boost = (mouseInfluenceRadius - dist) / mouseInfluenceRadius;
            alpha += boost * 0.5; 
        }
        alpha = Math.min(alpha, 1);

        const currentParticleColor = `rgba(${r}, ${g}, ${b}, ${alpha})`;

        const padding = 50;
        const pushStrength = 0.05;

        if (p.x < padding) p.vx += pushStrength;
        if (p.x > canvas.width - padding) p.vx -= pushStrength;
        if (p.y < padding) p.vy += pushStrength;
        if (p.y > canvas.height - padding) p.vy -= pushStrength;

        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;

        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        p.vx *= 0.98;
        p.vy *= 0.98;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        
        ctx.shadowBlur = alpha * 15;
        ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.8)`;
        
        ctx.strokeStyle = currentParticleColor;
        ctx.fillStyle = currentParticleColor; 
        ctx.lineWidth = 2; 

        icons[p.icon](ctx, p.size);
        
        ctx.restore();

        for (let j = i + 1; j < particles.length; j++) {
            const p2 = particles[j];
            const dx2 = p.x - p2.x;
            const dy2 = p.y - p2.y;
            const dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

            if (dist2 < connectionDistance) {
                const maxAlpha = Math.max(alpha, 0.4);
                
                const connectionAlpha = (1 - dist2 / connectionDistance) * maxAlpha;
                
                if (connectionAlpha > 0.05) {
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(p2.x, p2.y);
                    
                    ctx.shadowBlur = connectionAlpha * 10;
                    ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.5)`;
                    
                    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${connectionAlpha})`;
                    ctx.lineWidth = 1.5;
                    ctx.lineCap = 'round';
                    ctx.stroke();
                    
                   ctx.shadowBlur = 0;
                }
            }
        }
      });
      
      animationFrameId = requestAnimationFrame(draw);
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouseRef.current = { 
          x: e.clientX - rect.left, 
          y: e.clientY - rect.top 
      };
    };

    const handleMouseLeave = () => {
         mouseRef.current = { x: -1000, y: -1000 };
    };

    window.addEventListener('resize', resize);
    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', handleMouseLeave);

    resize();
    draw();

    return () => {
      window.removeEventListener('resize', resize);
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseleave', handleMouseLeave);
      cancelAnimationFrame(animationFrameId);
    };
  }, [theme]);

  return (
    <div ref={containerRef} className="absolute inset-0 z-0 overflow-hidden pointer-events-auto hidden lg:block">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
