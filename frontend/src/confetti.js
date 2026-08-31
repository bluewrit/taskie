import confetti from 'canvas-confetti';

// Small celebratory burst — fired when a task is completed.
export function celebrate() {
  confetti({
    particleCount: 90,
    spread: 75,
    startVelocity: 38,
    origin: { y: 0.72 },
    scalar: 0.9,
    ticks: 160,
    colors: ['#6366f1', '#8b5cf6', '#10b981', '#f59e0b', '#38bdf8'],
    disableForReducedMotion: true,
    zIndex: 400,
  });
}
