/** Testers' reports: what kind of problem, and where the admins left it. `error` is filed only by an error's Copy button (`copyError`), never
 *  picked in the report dialog. */
export const REPORT_KINDS = ['data', 'strategy', 'visual', 'idea', 'error'] as const;
export type ReportKind = typeof REPORT_KINDS[number];
export const REPORT_KIND_LABEL: Record<ReportKind, string> = { data: 'Wrong data', strategy: 'Strategy acted oddly', visual: 'Looks broken', idea: 'Idea', error: 'Error' };
export const REPORT_STATUSES = ['open', 'fixed', 'wontfix'] as const;
export type ReportStatus = typeof REPORT_STATUSES[number];
export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = { open: 'Open', fixed: 'Fixed', wontfix: 'Won’t fix' };
export type ReportTarget = { type: 'coin' | 'strategy'; id: string; label: string };
/** Limits: comment length, element text, the screen's data, and reports per person per hour. */
export const REPORT = { comment: 600, element: 300, shown: 24_000, perHour: 20 } as const;
