import { useId } from 'react';
import { CharacterDefs, CharacterEye, CharacterSurface } from './CharacterArt';

/** The same shaded vector flame as the lead character, sized for product chrome. */
export function FlameMark({ className }: { className?: string }) {
  const id = `flame-${useId().replace(/:/g, '')}`;
  return <svg viewBox="0 0 120 144" aria-hidden="true" className={className}>
    <CharacterDefs id={id} role="hotbot"/>
    <g transform="translate(60 88)"><CharacterSurface id={id} role="hotbot"/></g>
    <CharacterEye x={43} y={96}/>
    <CharacterEye x={77} y={96}/>
  </svg>;
}
