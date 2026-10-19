// The wordmark with a "text roll" on hover: the word slides up and out while an identical copy rolls in
// from below. Text placed under it (the tagline) stays still: the rolling box ends above it.
//
// The word moves as one piece: splitting Arabic into per-letter pieces would break the joined letters
// (لُبّ would render as separate, unconnected glyphs).
//
// The roll is driven by the surrounding link (Tailwind named group "brand"), so hovering anywhere on the logo
// link triggers it. Plain CSS transitions; they stop for people who prefer reduced motion.
import { Wordmark } from "./Brand";

const ease = "transition-transform duration-[450ms] ease-[cubic-bezier(0.65,0,0.35,1)] motion-reduce:transition-none";

// The word's box needs room for glyphs that overhang it: above (ُ ّ marks) and at the sides (heavy strokes),
// given back with negative margins so nothing shifts. Below, the room is real layout space (no negative
// margin): the box must stop above the tagline, or the incoming copy would slide across it.
const wordBox = {
  sm: "px-2 -mx-2 pt-2 -mt-2 pb-1",
  md: "px-4 -mx-4 pt-4 -mt-4 pb-3",
  lg: "px-8 -mx-8 pt-8 -mt-8 pb-4",
};
const wordCopy = { sm: "top-2 inset-x-2", md: "top-4 inset-x-4", lg: "top-8 inset-x-8" };

// 160% of a line's height clears it plus the overhanging marks, so a waiting copy never peeks into view.
// A pure roll (no fade): the box ends above the tagline, so the words never pass over it.
const far = {
  out: "group-hover/brand:-translate-y-[160%]",
  in: "translate-y-[160%] group-hover/brand:translate-y-0",
};

/** One line that rolls: `children` slides out upward, an identical copy rolls in from below. */
function Roll({ box = "", copyAt = "top-0 inset-x-0", children }) {
  return (
    <span className={`relative block overflow-hidden ${box}`}>
      <span className={`block ${ease} ${far.out}`}>{children}</span>
      <span aria-hidden className={`absolute block ${copyAt} ${ease} ${far.in}`}>
        {children}
      </span>
    </span>
  );
}

export function RollingWordmark({ size = "md" }) {
  return (
    <span className="inline-block align-top">
      <Roll box={wordBox[size]} copyAt={wordCopy[size]}>
        <Wordmark size={size} />
      </Roll>
    </span>
  );
}
