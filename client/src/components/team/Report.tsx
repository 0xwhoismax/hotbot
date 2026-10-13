"use client";
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { useMutation } from 'convex/react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { Copy, Crosshair, Flag, LoaderCircle, PenLine, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/convex';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { REPORT, REPORT_KINDS, REPORT_KIND_LABEL, type ReportKind, type ReportTarget } from '../../../../types/report';
import type { Focus } from './CommandPanel';
import type { HomeData } from './data';
import { copyError, failToast, reportAtom, viewAsAtom, type ReportDraft, type ShownError } from './state';
import s from './team.module.css';

/** Where a report starts: the decision dialog and coin rows pass their coin, anything else opens empty or in pick mode. */
export function useReport() {
  const set = useSetAtom(reportAtom);
  return { write: (draft: Omit<ReportDraft, 'stage'> = {}) => set({ ...draft, stage: 'write' }), pick: () => set({ stage: 'pick' }) };
}

/** The button an error carries: copies it with its context and reports it in the same press (`copyError`). */
export function CopyError({ error, size = 'xs' }: { error: ShownError; size?: 'xs' | 'sm' }) {
  return <Button size={size} variant="outline" onClick={event => { event.stopPropagation(); copyError(error); }} onKeyDown={event => { if (event.key === 'Enter') event.stopPropagation(); }} aria-label={`Copy and report: ${error.title}`}><Copy/>Copy error</Button>;
}

/** A row the home already holds for this id (a coin in any stage, or a strategy), as the screen composed it. */
function rowOf(data: HomeData | null, id: string): unknown {
  if (!data) return undefined;
  for (const list of Object.values(data)) if (Array.isArray(list)) { const row = list.find(entry => (entry as { id?: unknown })?.id === id); if (row) return row; }
  return undefined;
}
const labelOf = (row: unknown) => {
  const value = row as { name?: string; token?: { symbol?: string } } | undefined;
  return value?.token?.symbol ?? value?.name;
};
/** What a picked element is about: the nearest `data-report` ("coin:<itemId>" or "strategy:<id>"), else the coin or strategy page it sits on. */
function targetOf(element: Element, focus: Focus | null, data: HomeData | null): ReportTarget | undefined {
  const tagged = element.closest<HTMLElement>('[data-report]'), [type, id] = tagged?.dataset.report?.split(':') ?? [];
  if ((type === 'coin' || type === 'strategy') && id) return { type, id, label: tagged?.dataset.reportLabel ?? labelOf(rowOf(data, id)) ?? (type === 'coin' ? 'This coin' : 'This strategy') };
  if (focus?.page === 'token' && focus.itemId) return { type: 'coin', id: focus.itemId, label: labelOf(rowOf(data, focus.itemId)) ?? 'This coin' };
  if (focus?.page === 'strategy' && focus.strategyId) return { type: 'strategy', id: focus.strategyId, label: labelOf(rowOf(data, focus.strategyId)) ?? 'This strategy' };
  return undefined;
}
const textOf = (element: Element) => ((element as HTMLElement).innerText || element.getAttribute('aria-label') || element.getAttribute('title') || '').replace(/\s+/g, ' ').trim().slice(0, REPORT.element);
const typing = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'));
const dataKind = (draft: ReportDraft): ReportKind => draft.kind ?? (draft.target ? 'data' : draft.element ? 'visual' : 'idea');

/** Reporting, rendered once in TeamChrome: `F` (or the menu's Report a problem) starts pick mode, where one click or tap on anything
 *  opens the report dialog about it. Nothing listens while it is closed except the one `F` key handler. */
export function Reporter({ data, focus }: { data: HomeData | null; focus: Focus | null }) {
  const [draft, setDraft] = useAtom(reportAtom), picking = draft?.stage === 'pick';
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'f' || event.metaKey || event.ctrlKey || event.altKey || event.repeat || typing(event.target) || document.querySelector('[role=dialog]')) return;
      event.preventDefault(); setDraft(draft => draft ? draft : { stage: 'pick' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setDraft]);
  if (!draft) return null;
  return picking ? <Picker data={data} focus={focus} keep={draft}/> : <ReportDialog draft={draft} data={data}/>;
}

/** Pick mode: an outline follows the pointer; the click (or tap) that lands is swallowed and becomes the report's subject. */
function Picker({ data, focus, keep }: { data: HomeData | null; focus: Focus | null; keep: ReportDraft }) {
  const setDraft = useSetAtom(reportAtom), box = useRef<HTMLDivElement>(null), bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const ours = (target: EventTarget | null) => target instanceof Node && Boolean(bar.current?.contains(target));
    const over = (event: PointerEvent) => {
      const el = event.target instanceof Element && !ours(event.target) ? event.target.closest('[data-report]') ?? event.target : null, frame = box.current;
      if (!frame) return;
      if (!el || el === document.body || el === document.documentElement) { frame.hidden = true; return; }
      const r = el.getBoundingClientRect();
      Object.assign(frame.style, { top: `${r.top - 3}px`, left: `${r.left - 3}px`, width: `${r.width + 6}px`, height: `${r.height + 6}px` });
      frame.hidden = false;
    };
    // Buttons and menus act on pointerdown as well as click, so both are held while picking.
    const hold = (event: Event) => { if (!ours(event.target)) { event.preventDefault(); event.stopPropagation(); } };
    const pick = (event: MouseEvent) => {
      if (ours(event.target) || !(event.target instanceof Element)) return;
      event.preventDefault(); event.stopPropagation();
      const el = event.target.closest('[data-report]') ?? event.target, target = targetOf(el, focus, data), row = target ? rowOf(data, target.id) : undefined;
      setDraft({ ...keep, stage: 'write', element: textOf(el) || undefined, target: keep.target ?? target, shown: keep.shown ?? (row ? JSON.stringify(row) : undefined) });
    };
    const esc = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); setDraft(null); } };
    document.addEventListener('pointerover', over, true); document.addEventListener('pointerdown', hold, true); document.addEventListener('click', pick, true); document.addEventListener('keydown', esc, true);
    document.documentElement.dataset.picking = '';
    return () => {
      document.removeEventListener('pointerover', over, true); document.removeEventListener('pointerdown', hold, true); document.removeEventListener('click', pick, true); document.removeEventListener('keydown', esc, true);
      delete document.documentElement.dataset.picking;
    };
  }, [data, focus, keep, setDraft]);
  // On body, above the phone header and every page's own stacking.
  return createPortal(<>
    <div ref={box} className={s.reportBox} hidden aria-hidden/>
    <div ref={bar} className={s.reportBar} role="status">
      <Crosshair aria-hidden/><span className={s.grow}><b>Tap what’s wrong</b><small>Or just write to us</small></span>
      <Button size="sm" variant="ghost" onClick={() => setDraft({ ...keep, stage: 'write' })} aria-label="Just write"><PenLine/><span className={s.reportWrite}>Just write</span></Button>
      <Button size="sm" variant="secondary" onClick={() => setDraft(null)} aria-label="Cancel report"><X/></Button>
    </div>
  </>, document.body);
}

function ReportDialog({ draft, data }: { draft: ReportDraft; data: HomeData | null }) {
  const setDraft = useSetAtom(reportAtom), file = useMutation(api.reports.file), as = useAtomValue(viewAsAtom), pathname = usePathname();
  const [kind, setKind] = useState<ReportKind>(() => dataKind(draft)), [comment, setComment] = useState(draft.comment ?? ''), [busy, setBusy] = useState(false);
  const empty = !comment.trim() && !draft.target && !draft.element;
  const close = () => setDraft(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || empty) return;
    setBusy(true);
    const root = document.documentElement.dataset, theme = [document.documentElement.classList.contains('dark') ? 'dark' : 'light', root.scheme, root.surface, root.backdrop, root.corners].filter(Boolean).join(' ');
    // The coin or strategy as this screen composed it, when the opener didn't pass one.
    const shown = draft.shown ?? (draft.target ? JSON.stringify(rowOf(data, draft.target.id) ?? null) : undefined);
    try {
      await file({ kind, comment: comment.trim(), route: pathname, viewport: `${window.innerWidth}×${window.innerHeight}`, appearance: theme, ...as,
        ...(draft.target ? { target: draft.target } : {}), ...(draft.element ? { element: draft.element } : {}), ...(shown && shown !== 'null' ? { shown } : {}) });
      toast.success('Thanks, report sent', { description: 'We’ll let you know when it’s fixed.' });
      close();
    } catch (cause) { failToast(cause); } finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={next => { if (!next) close(); }}>
    <DialogContent className="sm:max-w-[28rem]" aria-describedby={undefined}>
      <form className={s.decision} onSubmit={submit}>
        <div className={s.decisionHead}><span className={s.accountIcon}><Flag size={18}/></span><span className={s.grow}><DialogTitle asChild><b>Report a problem</b></DialogTitle><small>{draft.target ? `About ${draft.target.label}` : draft.element ? 'About what you picked' : 'Anything about HOTBOT'}</small></span></div>
        {(draft.target || draft.element) && <div className={s.reportAbout}>
          {draft.target && <span className={s.pill}>{draft.target.type === 'coin' ? 'Coin' : 'Strategy'} · <b>{draft.target.label}</b></span>}
          {draft.element && <q className={s.reportQuote}>{draft.element}</q>}
        </div>}
        <div className={s.inviteField}><span className={s.inviteFieldLabel} id="report-kind">What’s wrong</span>
          <span className={s.seg} role="group" aria-labelledby="report-kind">{REPORT_KINDS.filter(value => value !== 'error').map(value => <button type="button" key={value} aria-pressed={value === kind} onClick={() => setKind(value)}>{REPORT_KIND_LABEL[value]}</button>)}</span>
        </div>
        <Textarea value={comment} maxLength={REPORT.comment} rows={3} autoFocus placeholder={kind === 'idea' ? 'What would make HOTBOT better?' : 'What did you expect to see?'} aria-label="Your note" onChange={event => setComment(event.target.value)}/>
        <div className={s.accountActions}>
          {!draft.target && !draft.element ? <Button type="button" variant="outline" disabled={busy} onClick={() => setDraft({ ...draft, kind, comment, stage: 'pick' })}><Crosshair/>Point at it</Button>
            : <DialogClose asChild><Button type="button" variant="secondary" disabled={busy}>Cancel</Button></DialogClose>}
          <Button type="submit" disabled={busy || empty}>{busy ? <LoaderCircle className="animate-spin"/> : <Send/>}Send report</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}
