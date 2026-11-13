/** The launch page lives at `/` and again at `/landing`; both render without the workspace shell. */
export const isLandingPath = (pathname: string) => pathname === '/' || pathname === '/landing';
/** The application: its intro at /join, and its questions alone at /join/apply. */
export const isJoinPath = (pathname: string) => pathname === '/join' || pathname === '/join/apply';
/** Pages without the workspace shell (sidebar, team panel, account services): the launch page, the application, the legal pages and the
 *  pay page a phone wallet opens (app/pay), which needs no sign-in. */
export const isBarePath = (pathname: string) => isLandingPath(pathname) || isJoinPath(pathname) || pathname === '/terms' || pathname === '/privacy' || pathname === '/pay';
