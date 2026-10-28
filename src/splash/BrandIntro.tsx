/**
 * Short start intro for AI Film Maker Studio: the mark and name fade in on
 * the app background, hold briefly, then fade out. Replaces the original
 * project's animated logo film, which carries that project's branding.
 */
import React, { useEffect, useRef, useState } from 'react';
import { AppLogoIcon } from '../components/icons';

type BrandIntroProps = {
  background?: 'dark' | 'light';
  reducedMotion?: boolean;
  onDone: () => void;
};

export default function BrandIntro({ background = 'dark', reducedMotion, onDone }: BrandIntroProps) {
  const [phase, setPhase] = useState<'in' | 'out'>('in');
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const reduced = reducedMotion ?? (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const hold = reduced ? 600 : 1300;
  const fade = reduced ? 0 : 450;

  useEffect(() => {
    const out = window.setTimeout(() => setPhase('out'), hold);
    const done = window.setTimeout(() => doneRef.current(), hold + fade);
    return () => {
      window.clearTimeout(out);
      window.clearTimeout(done);
    };
  }, [hold, fade]);

  const dark = background === 'dark';
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.25rem',
        background: dark ? '#1b1b1c' : '#dcdcdd',
        color: dark ? '#e2e2e2' : '#1d1d1f',
        opacity: phase === 'out' ? 0 : 1,
        transition: `opacity ${fade}ms ease`,
        pointerEvents: phase === 'out' ? 'none' : 'auto',
        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
      }}
    >
      <AppLogoIcon className="w-20 h-20" />
      <div style={{ fontSize: '1.25rem', fontWeight: 600, letterSpacing: '0.01em' }}>AI Film Maker Studio</div>
    </div>
  );
}
