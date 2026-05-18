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
  x = 0; y = 0; size = 0; vx = 0; vy = 0;
  opacity = 0; displayOpacity = 0;
  color = ''; life = 0; age = 0;
  rotation = 0; rotSpeed = 0;
  type: 'ember' | 'sunbeam' | 'paper' = 'ember';

  constructor(private W: number, private H: number) {
    this.reset();
  }

  reset() {
    const r = Math.random();
    this.type = r < 0.45 ? 'ember' : (r < 0.55 ? 'sunbeam' : 'paper');
    if (this.type === 'sunbeam') {
      this.x = Math.random() * this.W;
      this.y = -20 - Math.random() * 80;
      this.size = Math.random() * 1.8 + 0.5;
      this.vx = (Math.random() - 0.5) * 0.3;
      this.vy = Math.random() * 0.35 + 0.15;
      this.opacity = Math.random() * 0.4 + 0.1;
    } else if (this.type === 'ember') {
      this.x = Math.random() * this.W;
      this.y = Math.random() * this.H;
      this.size = Math.random() * 2.2 + 0.8;
      this.vx = (Math.random() - 0.5) * 0.35;
      this.vy = -(Math.random() * 0.4 + 0.08);
      this.opacity = Math.random() * 0.45 + 0.12;
    } else {
      this.x = Math.random() * this.W;
      this.y = Math.random() * this.H;
      this.size = Math.random() * 2.5 + 1.2;
      this.vx = (Math.random() - 0.5) * 0.25;
      this.vy = -(Math.random() * 0.3 + 0.05);
      this.opacity = Math.random() * 0.35 + 0.1;
    }
    this.color = COLORS[Math.floor(Math.random() * COLORS.length)];
    this.life = this.type === 'sunbeam' ? Math.random() * 350 + 250 : Math.random() * 300 + 200;
    this.age = Math.random() * this.life;
    this.rotation = Math.random() * Math.PI * 2;
    this.rotSpeed = (Math.random() - 0.5) * 0.006;
  }

  update(W: number, H: number) {
    this.age++;
    this.vx += (Math.random() - 0.5) * 0.015;
    this.vx *= 0.996;
    this.x += this.vx;
    this.y += this.vy;
    this.rotation += this.rotSpeed;

    const fadeRatio = Math.min(this.age / 50, (this.life - this.age) / 70, 1);
    this.displayOpacity = this.opacity * fadeRatio;

    if (this.type === 'sunbeam') {
      if (this.y > H + 20) { this.y = -20; this.x = Math.random() * W; }
    } else {
      if (this.y < -20) { this.y = H + 20; this.x = Math.random() * W; }
    }
    if (this.x < -20) this.x = W + 20;
    if (this.x > W + 20) this.x = -20;
    if (this.age > this.life) {
      this.age = 0;
      this.y = this.type === 'sunbeam' ? -20 : (Math.random() * H);
      this.x = Math.random() * W;
    }
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
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W = 0, H = 0;
    const particles: Particle[] = [];

    function resize() {
      const rect = canvas!.parentElement!.getBoundingClientRect();
      W = canvas!.width = rect.width;
      H = canvas!.height = rect.height;
    }
    resize();
    window.addEventListener('resize', resize);

    const COUNT = 60;
    for (let i = 0; i < COUNT; i++) particles.push(new Particle(W, H));

    let raf = 0;
    function tick() {
      ctx!.clearRect(0, 0, W, H);
      for (const p of particles) {
        p.update(W, H);
        p.draw(ctx!);
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
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: 2,
      }}
    />
  );
}
