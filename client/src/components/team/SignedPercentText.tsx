import { tone } from './format';
import s from './team.module.css';

export function SignedPercentText({ children }: { children: string | null | undefined }) {
  return children?.split(/([+−-](?:\d[\d,]*(?:\.\d+)?|\.\d+)%)/g).map((part, index) => {
    if (index % 2 === 0) return part;
    const value = Number(part.slice(0, -1).replace('−', '-').replaceAll(',', ''));
    return <span key={index} className={s[tone(value) ?? 'muted']}>{part}</span>;
  });
}
