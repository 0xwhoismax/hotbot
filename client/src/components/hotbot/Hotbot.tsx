"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import styles from "./Hotbot.module.css";
import { HOTBOT_CLOUD_PATH, HOTBOT_SHIELD_PATH } from "./geometry";
import { subscribeGaze, type Follower } from "./gaze";

/** Each silhouette's frame: its path, its viewBox (`w`×`h`, which the gaze scales against), its eyes' centres and radii, and where its z's
 *  start. The shield's frame is narrower than the cloud's, so its eyes are smaller to keep the same share of the body. */
const SHAPES = {
  cloud: { path: HOTBOT_CLOUD_PATH, viewBox: "-84 -78 170 138", w: 170, h: 138, eyes: [[-9, -6], [19, -6]], eye: [7.3, 11.5], z: [52, -58] },
  shield: { path: HOTBOT_SHIELD_PATH, viewBox: "-64 -72 128 142", w: 128, h: 142, eyes: [[-15, -12], [15, -12]], eye: [6, 9.5], z: [48, -64] },
} as const;

/** A z's drawn centre from its text anchor, in viewBox units at the z's font size (Hotbot.module.css). */
const Z_CENTRE = [12, -12] as const;

/** The live mascot's layers cover its square box, so each frame's moving points become shares of that box: the drawing scales to its longer
 *  side and sits centred (`xMidYMid meet`). `--u` is one viewBox unit; `--base` and `--pivot` are the body's bottom and its shake point. */
const LIVE = Object.fromEntries(Object.entries(SHAPES).map(([shape, frame]) => {
  const [minX, minY] = frame.viewBox.split(" ").map(Number), side = Math.max(frame.w, frame.h);
  const at = (x: number, y: number) => `${(((side - frame.w) / 2 + x - minX) / side) * 100}% ${(((side - frame.h) / 2 + y - minY) / side) * 100}%`;
  const top = (side - frame.h) / 2 / side, height = frame.h / side;
  return [shape, {
    "--u": `${100 / side}%`,
    "--base": `${(top + height) * 100}%`,
    "--pivot": `${(top + height * 0.9) * 100}%`,
    "--eyes": at((frame.eyes[0][0] + frame.eyes[1][0]) / 2, frame.eyes[0][1]),
    "--z": at(frame.z[0] + Z_CENTRE[0], frame.z[1] + Z_CENTRE[1]),
  } as CSSProperties];
})) as Record<keyof typeof SHAPES, CSSProperties>;

export type HotbotProps = {
  className?: string;
  color?: string;
  eyeColor?: string;
  size?: number;
  animated?: boolean;
  followCursor?: boolean;
  label?: string;
  shape?: keyof typeof SHAPES;
  /** What the mascot is doing: asleep shuts its eyes, breathes slowly and drifts z's; scan sweeps its eyes side to side; shy shuts its eyes
   *  while something private shows. */
  mood?: "asleep" | "scan" | "shy";
};

/** At or under this size a mascot is an icon in a row or badge. */
const STILL_AT = 28;

/** Flat, recolorable mascot: bots are clouds, ShieldBot the shield. Decorative unless a label is supplied. Icons (`STILL_AT` and under) and
 *  mascots with motion off render as a plain SVG with no hooks, listeners or animation, so lists of them cost nothing per pointer move or frame. */
export function Hotbot({ animated = true, followCursor = true, ...props }: HotbotProps) {
  return (props.size ?? 64) <= STILL_AT || (!animated && !followCursor) ? <HotbotIcon {...props}/>
    : <LiveHotbot {...props} animated={animated} followCursor={followCursor}/>;
}

/** The still mascot: the same drawing, nothing running. */
function HotbotIcon({ color = "#b5dca0", eyeColor = "#101719", size = 64, label, shape = "cloud", mood, className }: Omit<HotbotProps, "animated" | "followCursor">) {
  const frame = SHAPES[shape];
  return (
    <svg viewBox={frame.viewBox} width={size} height={size} fill="none" role={label ? "img" : undefined} aria-label={label}
      aria-hidden={label ? undefined : true} focusable="false" data-slot="hotbot" data-animated={false} data-mood={mood} className={cn(styles.hotbot, "shrink-0", className)}>
      <path d={frame.path} style={{ fill: color }} />
      <g className={styles.eyes} fill={eyeColor}>
        {frame.eyes.map(([cx, cy]) => <ellipse key={cx} cx={cx} cy={cy} rx={frame.eye[0]} ry={frame.eye[1]} />)}
      </g>
    </svg>
  );
}

/** The live mascot: eyes follow the cursor, it floats and blinks, and with no cursor it glances to the side now and then (`data-idle`); asleep, it breathes with its eyes shut and z's drift up. Every moving part
 *  is an HTML layer over a still SVG, so the browser's compositor runs the motion without repainting the drawing each frame. */
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
}: HotbotProps) {
  const frame = SHAPES[shape];
  const box = useRef<HTMLSpanElement>(null);
  const gaze = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!followCursor) {
      gaze.current?.style.removeProperty("transform");
      box.current?.setAttribute("data-idle", "true");
      return;
    }
    const measure: Follower = (point) => {
      if (!box.current || !gaze.current) return;
      let x = 0;
      let y = 0;
      if (point) {
        const rect = box.current.getBoundingClientRect();
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
          x = (dx / distance) * reach * travel * scale;
          y = (dy / distance) * reach * travel * (5 / 7) * scale;
        }
      }
      return () => {
        if (gaze.current) gaze.current.style.transform = `translate(${x}px, ${y}px)`;
        box.current?.setAttribute("data-idle", point ? "false" : "true");
      };
    };
    // Gaze responds directly to input. CSS removes easing, float and blink
    // under reduced motion; it must not disconnect pointer interaction.
    return subscribeGaze(measure);
  }, [followCursor, frame]);

  return (
    <span
      ref={box}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-slot="hotbot"
      data-animated={animated}
      data-mood={mood}
      className={cn(styles.hotbot, styles.live, "shrink-0", className)}
      style={{ width: size, height: size, ...LIVE[shape] }}
    >
      <span className={styles.body}>
        <svg viewBox={frame.viewBox} fill="none" focusable="false"><path d={frame.path} style={{ fill: color }} /></svg>
        <span ref={gaze} className={styles.gaze}>
          <span className={styles.eyes}>
            <svg viewBox={frame.viewBox} fill={eyeColor} focusable="false">
              {frame.eyes.map(([cx, cy]) => <ellipse key={cx} cx={cx} cy={cy} rx={frame.eye[0]} ry={frame.eye[1]} />)}
            </svg>
          </span>
        </span>
      </span>
      {mood === "asleep" && animated && <span className={styles.zs}>
        {[0, 1, 2].map(n => <span key={n} style={{ animationDelay: `${n}s` }}>
          <svg viewBox={frame.viewBox} fill="currentColor" focusable="false"><text x={frame.z[0]} y={frame.z[1]}>z</text></svg>
        </span>)}
      </span>}
    </span>
  );
}
