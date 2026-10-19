"use client";

// Shared Framer Motion presets, so every animation in the app feels the same.
// Respecting "reduce motion" is handled once, by <MotionConfig reducedMotion="user"> in app/providers.jsx.
import { motion } from "motion/react";

export const ease = [0.2, 0.8, 0.2, 1]; // quick out, soft landing
export const spring = { type: "spring", stiffness: 420, damping: 32, mass: 0.8 }; // for hover / press / sliding highlights

/** Fade + rise in. Spread onto any motion element: <motion.div {...enter}> */
export const enter = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease },
};

const list = { hidden: {}, show: { transition: { staggerChildren: 0.045 } } };
const item = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease } },
  exit: { opacity: 0, x: 0, scale: 0.98, transition: { duration: 0.2, ease } },
};

/** A list/grid whose children (StaggerItem) arrive one after another. */
export function Stagger({ as = "div", className = "", children }) {
  const Tag = motion[as];
  return (
    <Tag className={className} variants={list} initial="hidden" animate="show">
      {children}
    </Tag>
  );
}

/** A child of <Stagger>. `layout` makes it glide when the list reorders; wrap in AnimatePresence to animate removal. */
export function StaggerItem({ as = "div", className = "", children, ...props }) {
  const Tag = motion[as];
  return (
    <Tag className={className} variants={item} exit="exit" layout="position" {...props}>
      {children}
    </Tag>
  );
}
