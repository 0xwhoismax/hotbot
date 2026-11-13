/** One pointer for every mounted mascot: a single listener and a single scheduled frame, however many are on screen. */
export type Pointer = { x: number; y: number } | null;
export type Follower = (pointer: Pointer) => (() => void) | undefined;
const followers = new Set<Follower>();
let pointer: Pointer = null;
let frame = 0;

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
export function subscribeGaze(follow: Follower) {
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
