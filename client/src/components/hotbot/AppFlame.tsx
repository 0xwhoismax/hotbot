"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { APP_FLAME } from "./geometry";
import { subscribeGaze } from "./gaze";
import s from "./AppFlame.module.css";

/** How far the eyes travel toward the cursor, in the drawing's units (`APP_FLAME.viewBox`). */
const TRAVEL = { x: 34, y: 24 };

/** At or under this size a flame is an icon in a row or badge. */
const STILL_AT = 28;

type AppFlameProps = { size?: number; mood?: "shy"; faceLeft?: boolean; rest?: readonly [number, number]; still?: boolean; className?: string };
/** The app icon's flame without its tile: the same drawing, gradient and slanted eyes. The eyes follow the cursor; with none (a phone, or before the
 *  mouse moves) they rest at `rest` (a share of their reach on each axis, -1 to 1; centred without it), glance aside now and then, tilt a little,
 *  bob and blink. `size` makes a square box that the flame fits; without it the flame fills its container's width. `faceLeft` flips the whole flame to face left. `mood="shy"` shuts the eyes
 *  while something private shows. Icons (`STILL_AT` and under) and a `still` flame are the plain drawing, with no hooks, listeners or animation, so
 *  lists of them cost nothing per pointer move or frame. */
export function AppFlame({ still, ...props }: AppFlameProps) {
  return still || (props.size !== undefined && props.size <= STILL_AT) ? <StillFlame {...props}/> : <LiveFlame {...props}/>;
}

const flip = `matrix(-1 0 0 1 ${APP_FLAME.axis * 2} 0)`;

function Drawing({ id, faceLeft, children }: { id: string; faceLeft?: boolean; children: ReactNode }) {
  const { gradient } = APP_FLAME;
  return <>
    <defs>
      <radialGradient id={id} gradientUnits="userSpaceOnUse" cx={gradient.cx} cy={gradient.cy} r={gradient.r} fx={gradient.fx} fy={gradient.fy}>
        {gradient.stops.map(([offset, color]) => <stop key={offset} offset={offset} stopColor={color}/>)}
      </radialGradient>
    </defs>
    <path fill={`url(#${id})`} d={APP_FLAME.path} transform={faceLeft ? flip : undefined}/>
    {children}
  </>;
}

const Eyes = ({ eyeClass, faceLeft }: { eyeClass?: string; faceLeft?: boolean }) => <g transform={faceLeft ? flip : undefined}>{APP_FLAME.eyes.map(eye => <g key={eye.cx} className={eyeClass}><ellipse cx={eye.cx} cy={eye.cy} rx={eye.rx} ry={eye.ry} transform={`rotate(${eye.slant} ${eye.cx} ${eye.cy})`} fill={APP_FLAME.ink}/></g>)}</g>;

function StillFlame({ size, mood, faceLeft, className }: Omit<AppFlameProps, "still" | "rest">) {
  const id = `app-flame-${useId().replace(/:/g, "")}`;
  return <svg viewBox={APP_FLAME.viewBox} aria-hidden="true" focusable="false" data-slot="hotbot" className={cn(s.flame, className)}
    style={size === undefined ? undefined : { width: size, height: size }}>
    <Drawing id={id} faceLeft={faceLeft}><g style={mood === "shy" ? { transform: "scaleY(0.14)", transformBox: "fill-box", transformOrigin: "center" } : undefined}><Eyes faceLeft={faceLeft}/></g></Drawing>
  </svg>;
}

function LiveFlame({ size, mood, faceLeft, rest, className }: Omit<AppFlameProps, "still">) {
  const id = `app-flame-${useId().replace(/:/g, "")}`;
  const root = useRef<SVGSVGElement>(null), gaze = useRef<SVGGElement>(null), [restX = 0, restY = 0] = rest ?? [];
  useEffect(() => subscribeGaze(point => {
    const box = root.current;
    let x = restX * TRAVEL.x, y = restY * TRAVEL.y;
    if (point && box) {
      const rect = box.getBoundingClientRect();
      if (!rect.width || !rect.height || rect.bottom < 0 || rect.top > window.innerHeight) return;
      const dx = point.x - (rect.left + rect.width * 0.5), dy = point.y - (rect.top + rect.height * 0.55), distance = Math.hypot(dx, dy);
      if (distance) { const reach = Math.min(distance / 180, 1); x = (dx / distance) * reach * TRAVEL.x; y = (dy / distance) * reach * TRAVEL.y; }
    }
    return () => {
      if (gaze.current) gaze.current.style.transform = `translate(${x}px, ${y}px)`;
      box?.setAttribute("data-idle", point ? "false" : "true");
    };
  }), [restX, restY]);
  return <svg ref={root} viewBox={APP_FLAME.viewBox} aria-hidden="true" focusable="false" data-slot="hotbot" data-mood={mood} data-rest={restX < 0 || faceLeft ? "left" : undefined} className={cn(s.flame, size === undefined && s.fluid, className)}
    style={size === undefined ? undefined : { width: size, height: size }}>
    <g className={s.body}>
      <Drawing id={id} faceLeft={faceLeft}><g ref={gaze} className={s.gaze}><g className={s.glance}><Eyes eyeClass={s.eye} faceLeft={faceLeft}/></g></g></Drawing>
    </g>
  </svg>;
}
