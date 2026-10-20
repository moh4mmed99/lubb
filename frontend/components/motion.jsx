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

/**
 * Page entrance. Glass cards can't blur what's behind them while they, or anything around them, are partly
 * transparent: they'd flash clear, then frost. So nothing that holds or is a glass card ever fades. The page
 * only rises; glass cards rise into place (`rise`); plain things like the page header fade (`fadeIn`). Both
 * are picked up through the variant names "hidden" / "show".
 */
export const pageEnter = {
  variants: { hidden: { y: 8 }, show: { y: 0, transition: { duration: 0.35, ease } } },
  initial: "hidden",
  animate: "show",
};
/** Variants for an element that fades in with the page (or with its <Stagger> list). Not for glass. */
export const fadeIn = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.35, ease } } };
/** Variants for a glass card: it arrives already frosted and settles into place, without fading. */
export const rise = { hidden: { y: 10, scale: 0.99 }, show: { y: 0, scale: 1, transition: { duration: 0.4, ease } } };

const list = { hidden: {}, show: { transition: { staggerChildren: 0.045 } } };
const item = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease } },
  exit: { opacity: 0, x: 0, scale: 0.98, transition: { duration: 0.2, ease } },
};
// For items that are glass cards: they never fade (see pageEnter); the card itself rises
const solidItem = {
  hidden: { y: 8 },
  show: { y: 0, transition: { duration: 0.35, ease } },
  exit: { scale: 0.98, transition: { duration: 0.2, ease } },
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

/**
 * A child of <Stagger>. `layout` makes it glide when the list reorders; wrap in AnimatePresence to animate removal.
 * `card`: the item wraps a glass Card, so it must not fade (see pageEnter).
 */
export function StaggerItem({ as = "div", className = "", card = false, children, ...props }) {
  const Tag = motion[as];
  return (
    <Tag className={className} variants={card ? solidItem : item} exit="exit" layout="position" {...props}>
      {children}
    </Tag>
  );
}
