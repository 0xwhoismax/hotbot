"use client";

import { useEffect, useRef, type ComponentProps } from "react";
import { cn } from "@/lib/utils";
import styles from "./Hotbot.module.css";
import { HOTBOT_CLOUD_PATH, HOTBOT_FLAME_PATH, HOTBOT_SHIELD_PATH } from "./geometry";

/** Each silhouette's frame: its path, its viewBox (`w`×`h`, which the gaze scales against), its eyes' centres and radii, and where its z's
 *  start. The shield's frame is narrower than the cloud's, so its eyes are smaller to keep the same share of the body. */
const SHAPES = {
  cloud: { path: HOTBOT_CLOUD_PATH, viewBox: "-84 -78 170 138", w: 170, h: 138, eyes: [[-9, -6], [19, -6]], eye: [7.3, 11.5], z: [52, -58] },
  flame: { path: HOTBOT_FLAME_PATH, viewBox: "-8 -6 137 152", w: 137, h: 152, eyes: [[45, 94], [76, 94]], eye: [7.3, 11.5], z: [100, 8] },
  shield: { path: HOTBOT_SHIELD_PATH, viewBox: "-64 -72 128 142", w: 128, h: 142, eyes: [[-15, -12], [15, -12]], eye: [6, 9.5], z: [48, -64] },
} as const;


type Pointer = { x: number; y: number } | null;
type Follower = (pointer: Pointer) => (() => void) | undefined;
const followers = new Set<Follower>();
let pointer: Pointer = null;
let frame = 0;

// Every mounted Hotbot shares one pointer listener and one scheduled frame.
function scheduleGaze() {
  if (frame) return;
  frame = window.requestAnimationFrame(() => {
    frame = 0;
    // Read every cloud's geometry before writing transforms, avoiding repeated
    // layout work when several agents are visible together.
    const updates = Array.from(followers, follow => follow(pointer));
    updates.forEach(update => update?.());
  });
}
function movePointer(event: PointerEvent) {
  if (event.pointerType === "touch") return;
  pointer = { x: event.clientX, y: event.clientY };
  scheduleGaze();
}
function resetPointer() {
  pointer = null;
  scheduleGaze();
}
function subscribeGaze(follow: Follower) {
  if (!followers.size) {
    window.addEventListener("pointermove", movePointer, { passive: true });
    document.documentElement.addEventListener("pointerleave", resetPointer);
    window.addEventListener("blur", resetPointer);
    window.addEventListener("scroll", scheduleGaze, { passive: true, capture: true });
    window.addEventListener("resize", scheduleGaze, { passive: true });
  }
  followers.add(follow);
  follow(pointer)?.();
  return () => {
    followers.delete(follow);
    if (followers.size) return;
    window.removeEventListener("pointermove", movePointer);
    document.documentElement.removeEventListener("pointerleave", resetPointer);
    window.removeEventListener("blur", resetPointer);
    window.removeEventListener("scroll", scheduleGaze, true);
    window.removeEventListener("resize", scheduleGaze);
    window.cancelAnimationFrame(frame);
    frame = 0;
    pointer = null;
  };
}

export type HotbotProps = Omit<ComponentProps<"svg">, "children" | "color" | "ref"> & {
  color?: string;
  eyeColor?: string;
  size?: number | string;
  animated?: boolean;
  followCursor?: boolean;
  label?: string;
  shape?: keyof typeof SHAPES;
  /** What the mascot is doing: asleep shuts its eyes, breathes slowly and drifts z's; scan sweeps its eyes side to side; shy shuts its eyes
   *  while something private shows; worried opens them wide and shakes its head, while someone is about to leave. */
  mood?: "asleep" | "scan" | "shy" | "worried";
};

/** At or under this size a mascot is an icon in a row or badge. */
const STILL_AT = 28;

/** Flat, recolorable mascot: bots are clouds, HOTBOT is the flame, ShieldBot the shield. Decorative unless a label is supplied. Icons (`STILL_AT` and under) and
 *  mascots with motion off render as a plain SVG with no hooks, listeners or animation, so lists of them cost nothing per pointer move or frame. */
export function Hotbot({ animated = true, followCursor = true, ...props }: HotbotProps) {
  const size = props.size ?? 64;
  return (typeof size === "number" && size <= STILL_AT) || (!animated && !followCursor) ? <HotbotIcon {...props}/>
    : <LiveHotbot {...props} animated={animated} followCursor={followCursor}/>;
}

/** The still mascot: the same drawing, nothing running. */
function HotbotIcon({ color = "#b5dca0", eyeColor = "#101719", size = 64, label, shape = "cloud", mood, className, ...props }: Omit<HotbotProps, "animated" | "followCursor">) {
  const frame = SHAPES[shape];
  return (
    <svg viewBox={frame.viewBox} width={size} height={size} fill="none" role={label ? "img" : undefined} aria-label={label}
      aria-hidden={label ? undefined : true} focusable="false" data-animated={false} data-mood={mood} className={cn(styles.hotbot, "shrink-0", className)} {...props}>
      <path d={frame.path} fill={color} />
      <g className={styles.eyes} fill={eyeColor}>
        {frame.eyes.map(([cx, cy]) => <ellipse key={cx} cx={cx} cy={cy} rx={frame.eye[0]} ry={frame.eye[1]} />)}
      </g>
    </svg>
  );
}

/** The live mascot: eyes follow the cursor, it floats and blinks; asleep, it breathes with its eyes shut and z's drift up. */
function LiveHotbot({
  color = "#b5dca0",
  eyeColor = "#101719",
  size = 64,
  animated = true,
  followCursor = true,
  label,
  shape = "cloud",
  mood,
  className,
  ...props
}: HotbotProps) {
  const frame = SHAPES[shape];
  const svg = useRef<SVGSVGElement>(null);
  const gaze = useRef<SVGGElement>(null);

  useEffect(() => {
    if (!followCursor) {
      gaze.current?.style.removeProperty("transform");
      return;
    }
    const measure: Follower = (point) => {
      if (!svg.current || !gaze.current) return;
      let x = 0;
      let y = 0;
      if (point) {
        const rect = svg.current.getBoundingClientRect();
        if (!rect.width || !rect.height || rect.bottom < 0 || rect.top > window.innerHeight) return;
        const dx = point.x - (rect.left + rect.width * 0.53);
        const dy = point.y - (rect.top + rect.height * 0.52);
        const distance = Math.hypot(dx, dy);
        const reach = Math.min(distance / 180, 1);
        if (distance) {
          // SVG units shrink with the icon. Keep the gaze readable from the
          // sidebar up to hero sizes without pushing the eyes outside the body.
          const scale = Math.min(rect.width / frame.w, rect.height / frame.h);
          const travel = Math.min(16, Math.max(12, 1.8 / scale));
          x = (dx / distance) * reach * travel;
          y = (dy / distance) * reach * travel * (5 / 7);
        }
      }
      return () => { if (gaze.current) gaze.current.style.transform = `translate(${x}px, ${y}px)`; };
    };
    // Gaze responds directly to input. CSS removes easing, float and blink
    // under reduced motion; it must not disconnect pointer interaction.
    return subscribeGaze(measure);
  }, [followCursor, frame]);

  return (
    <svg
      ref={svg}
      viewBox={frame.viewBox}
      width={size}
      height={size}
      fill="none"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      data-animated={animated}
      data-mood={mood}
      className={cn(styles.hotbot, "shrink-0", className)}
      {...props}
    >
      <g className={styles.body}>
        <path d={frame.path} fill={color} />
        <g ref={gaze} className={styles.gaze}>
          <g className={styles.eyes} fill={eyeColor}>
            {frame.eyes.map(([cx, cy]) => <ellipse key={cx} cx={cx} cy={cy} rx={frame.eye[0]} ry={frame.eye[1]} />)}
          </g>
        </g>
      </g>
      {mood === "asleep" && animated && <g className={styles.zs} fill="currentColor">
        {[0, 1, 2].map(n => <text key={n} x={frame.z[0]} y={frame.z[1]} style={{ animationDelay: `${n}s` }}>z</text>)}
      </g>}
    </svg>
  );
}
