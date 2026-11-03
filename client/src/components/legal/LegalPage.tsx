import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import { FlameMark } from '@/components/hotbot/landing/FlameMark';
import { LEGAL, REAL_SOL, type LegalBlock, type LegalDoc, type LegalKind } from '../../../../types/legal';
import { LegalMascot } from './LegalMascot';
import { LegalNav } from './LegalNav';
import o from '@/components/team/onboarding.module.css';

/** A run of legal text: **bold** and [links](/path). */
export function LegalText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|\[([^\[\]]+)\]\((\/[^)]*)\)/g;
  let at = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > at) parts.push(text.slice(at, match.index));
    parts.push(match[1] !== undefined ? <b key={match.index}>{match[1]}</b> : <Link key={match.index} href={match[3]!}>{match[2]}</Link>);
    at = match.index + match[0].length;
  }
  parts.push(text.slice(at));
  return <>{parts}</>;
}

function Block({ block }: { block: LegalBlock }) {
  if (typeof block === 'string') return <p><LegalText text={block}/></p>;
  if ('list' in block) return <ul>{block.list.map(item => <li key={item}><LegalText text={item}/></li>)}</ul>;
  if ('table' in block) {
    const [head, ...rows] = block.table;
    return <div className={o.legalTable}><table>
      <thead><tr>{head!.map(cell => <th key={cell} scope="col">{cell}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={row[0]}>{row.map((cell, index) => index ? <td key={index}><LegalText text={cell}/></td> : <th key={index} scope="row">{cell}</th>)}</tr>)}</tbody>
    </table></div>;
  }
  return <aside className={o.legalNote} aria-label={block.note}><b>{block.note}</b>{block.blocks.map((inner, index) => <Block key={index} block={inner}/>)}</aside>;
}

/** The short version as rows of a label and its point. */
export function LegalPoints({ points }: { points: readonly (readonly [string, string])[] }) {
  return <dl className={o.legalShort}>{points.map(([label, text]) => <Fragment key={label}><dt>{label}</dt><dd><LegalText text={text}/></dd></Fragment>)}</dl>;
}

/** /terms and /privacy: the document with its version and short version, a sticky contents column beside it, and the other document a link away. With `realSol`, the
 *  Terms end with the Real SOL risk notice that the Go live step shows (`#real-sol`). */
export function LegalPage({ doc, kind, other, realSol }: { doc: LegalDoc; kind: LegalKind; other: { href: string; label: string }; realSol?: boolean }) {
  return <div className={o.join}>
    <header className={o.joinTop}>
      <Link href="/" className={o.joinBrand}><FlameMark className="h-6 w-auto"/>HOTBOT</Link>
      <Link href={other.href} className={o.joinCount}>{other.label}</Link>
    </header>
    <div className={o.legalLayout}>
    <LegalNav items={[...doc.sections.map(({ id, title }) => ({ id, title })), ...realSol ? [{ id: 'real-sol', title: REAL_SOL.title }] : []]}/>
    <main className={o.legal}>
      <div className={o.legalHero}>
        <LegalMascot size={128}/>
        <div><h1 className={o.title}>{doc.title}</h1><p className={o.legalVersion}><span className={o.legalPill}>Beta</span>Version {LEGAL[kind].version}</p></div>
      </div>
      {doc.intro.map((block, index) => <Block key={index} block={block}/>)}
      <aside className={o.legalNote}>{doc.short}</aside>
      {doc.sections.map(section => <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`}>
        <h2 id={`${section.id}-title`}>{section.title}</h2>
        {section.blocks.map((block, index) => <Block key={index} block={block}/>)}
      </section>)}
      {realSol && <section id="real-sol" aria-labelledby="real-sol-title">
        <h2 id="real-sol-title">{REAL_SOL.title} <small>Version {LEGAL.realSol.version}</small></h2>
        <LegalPoints points={REAL_SOL.points}/>
        <p>When you go live you declare:</p>
        <ul>{REAL_SOL.declares.map(line => <li key={line}>{line}</li>)}</ul>
      </section>}
    </main>
    </div>
  </div>;
}
