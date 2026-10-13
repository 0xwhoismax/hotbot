/** The launch page lives at `/` and again at `/landing`; both render without the workspace shell. */
export const isLandingPath = (pathname: string) => pathname === '/' || pathname === '/landing';
/** Pages without the workspace shell (sidebar, team panel, account services): the launch page and the /join application. */
export const isBarePath = (pathname: string) => isLandingPath(pathname) || pathname === '/join';
