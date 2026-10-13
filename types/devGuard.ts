/** The development server answers only requests that name loopback. A web page open in the same browser could otherwise reach it by DNS
 *  rebinding: it points a name it owns at 127.0.0.1, but its requests still carry that name in the `Host` header. */

/** Whether a `Host` header names loopback, on `port` when one is given. */
export function hostIsLocal(host: string | null | undefined, port?: number | string): boolean {
  const named = /^(127\.0\.0\.1|localhost|\[::1\])(?::(\d+))?$/i.exec(host ?? '');
  return Boolean(named) && (port === undefined || named![2] === String(port));
}
