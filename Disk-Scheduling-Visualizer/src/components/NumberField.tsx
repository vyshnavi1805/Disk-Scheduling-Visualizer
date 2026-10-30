import { useEffect, useState, type CSSProperties } from 'react';

interface Props {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
}

/**
 * Integer input that lets the user type freely. The text is local while editing:
 * the value is sent upward only when it parses and is in range, so intermediate
 * states like "" or "1" (on the way to "150") never clobber anything. On blur or
 * Enter, an empty or out-of-range entry is clamped and shown.
 */
export function NumberField({ value, onChange, min = -Infinity, max = Infinity, className, style, ariaLabel }: Props) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);

  // Follow outside changes (Reset, Shuffle, Load) unless the user is mid-edit.
  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  const commit = () => {
    const n = parseInt(text, 10);
    const clamped = Number.isNaN(n) ? value : Math.min(max, Math.max(min, n));
    setText(String(clamped));
    if (clamped !== value) onChange(clamped);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={ariaLabel}
      value={text}
      onFocus={() => setFocused(true)}
      onChange={e => {
        const t = e.target.value.replace(/[^\d-]/g, '');
        setText(t);
        const n = parseInt(t, 10);
        if (!Number.isNaN(n) && n >= min && n <= max) onChange(n);
      }}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      className={className}
      style={style}
    />
  );
}
