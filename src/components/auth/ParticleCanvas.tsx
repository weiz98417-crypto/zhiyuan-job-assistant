'use client';

import { useEffect, useRef } from 'react';

const COLORS = [
  'oklch(75% 0.12 75 / 0.55)',
  'oklch(80% 0.10 82 / 0.45)',
  'oklch(70% 0.13 72 / 0.35)',
  'oklch(84% 0.07 88 / 0.5)',
  'oklch(72% 0.10 78 / 0.3)',
];

class Particle {
  x = 0;
  y = 0;
  size = 0;
  vx = 0;
  vy = 0;
  opacity = 0;
  displayOpacity = 0;
  color = '';
  life = 0;
  age = 0;
  rotation = 0;
  rotSpeed = 0;
  type: 'ember' | 'sunbeam' | 'paper' = 'ember';

  constructor(private width: number, private height: number) {
    this.reset();
  }

  reset() {
    const kind = Math.random();
    this.type = kind < 0.45 ? 'ember' : kind < 0.55 ? 'sunbeam' : 'paper';
    this.x = Math.random() * this.width;
    this.y = this.type === 'sunbeam' ? -20 - Math.random() * 80 : Math.random() * this.height;
    this.size = this.type === 'paper' ? Math.random() * 2.5 + 1.2 : Math.random() * 2.2 + 0.8;
    this.vx = (Math.random() - 0.5) * (this.type === 'sunbeam' ? 0.3 : 0.35);
    this.vy = this.type === 'sunbeam' ? Math.random() * 0.35 + 0.15 : -(Math.random() * 0.4 + 0.08);
    this.opacity = Math.random() * 0.4 + 0.1;
    this.color = COLORS[Math.floor(Math.random() * COLORS.length)];
    this.life = this.type === 'sunbeam' ? Math.random() * 350 + 250 : Math.random() * 300 + 200;
    this.age = Math.random() * this.life;
    this.rotation = Math.random() * Math.PI * 2;
    this.rotSpeed = (Math.random() - 0.5) * 0.006;
  }

  update(width: number, height: number) {
    this.age++;
    this.vx += (Math.random() - 0.5) * 0.015;
    this.vx *= 0.996;
    this.x += this.vx;
    this.y += this.vy;
    this.rotation += this.rotSpeed;

    const fadeRatio = Math.min(this.age / 50, (this.life - this.age) / 70, 1);
    this.displayOpacity = Math.max(0, this.opacity * fadeRatio);

    if (this.type === 'sunbeam' && this.y > height + 20) this.y = -20;
    if (this.type !== 'sunbeam' && this.y < -20) this.y = height + 20;
    if (this.x < -20) this.x = width + 20;
    if (this.x > width + 20) this.x = -20;
    if (this.age > this.life) this.reset();
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.globalAlpha = this.displayOpacity;
    if (this.type === 'sunbeam') {
      const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size * 3.5);
      grad.addColorStop(0, 'oklch(80% 0.10 82 / 0.8)');
      grad.addColorStop(0.3, this.color);
      grad.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * 3.5, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    } else {
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rotation);
      ctx.fillStyle = this.color;
      if (this.type === 'ember') {
        ctx.beginPath();
        ctx.arc(0, 0, this.size * 0.8, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-this.size * 0.7, -this.size * 0.15, this.size * 1.4, this.size * 0.3);
      }
    }
    ctx.restore();
  }
}

export default function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const activeCanvas = canvas;
    const activeCtx = ctx;

    let width = 0;
    let height = 0;
    const particles: Particle[] = [];

    function resize() {
      const rect = activeCanvas.parentElement?.getBoundingClientRect();
      width = activeCanvas.width = Math.max(1, Math.floor(rect?.width || 1));
      height = activeCanvas.height = Math.max(1, Math.floor(rect?.height || 1));
    }

    resize();
    window.addEventListener('resize', resize);
    for (let index = 0; index < 60; index++) particles.push(new Particle(width, height));

    let raf = 0;
    function tick() {
      activeCtx.clearRect(0, 0, width, height);
      for (const particle of particles) {
        particle.update(width, height);
        particle.draw(activeCtx);
      }
      raf = requestAnimationFrame(tick);
    }
    tick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 2,
      }}
    />
  );
}
