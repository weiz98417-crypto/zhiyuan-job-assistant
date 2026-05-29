/* ── Animation Presets (Task 2.7) ── */
import type { Variants } from "framer-motion";

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.19, 1, 0.22, 1] },
  },
};

export const staggerChildren: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.06, delayChildren: 0.1 },
  },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.19, 1, 0.22, 1] },
  },
};

/** Page flip — like turning a journal page */
export const pageFlip: Variants = {
  initial: { opacity: 0, rotateY: -4, x: -20 },
  animate: {
    opacity: 1,
    rotateY: 0,
    x: 0,
    transition: { duration: 0.5, ease: [0.19, 1, 0.22, 1] },
  },
  exit: {
    opacity: 0,
    rotateY: 4,
    x: 20,
    transition: { duration: 0.3, ease: [0.19, 1, 0.22, 1] },
  },
};

/** Handwriting reveal — like ink gradually appearing on paper */
export const handwritingReveal: Variants = {
  hidden: { opacity: 0, pathLength: 0 },
  visible: {
    opacity: 1,
    pathLength: 1,
    transition: { duration: 0.8, ease: [0.19, 1, 0.22, 1] },
  },
};

/** Gentle card lift on hover */
export const cardLift = {
  rest: { y: 0, transition: { duration: 0.3, ease: [0.19, 1, 0.22, 1] } },
  hover: { y: -3, transition: { duration: 0.3, ease: [0.19, 1, 0.22, 1] } },
};

/** Count-up number reveal */
export const countUp = (delay = 0): Variants => ({
  hidden: { opacity: 0, scale: 0.5 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.5, delay, ease: [0.19, 1, 0.22, 1] },
  },
});
