'use client';
/**
 * Design-system primitives (Tailwind + cva), shared by web, the Telegram Mini App and admin.
 * Logical properties (ps/pe/ms/me/start/end) keep every component RTL-correct.
 */
import * as React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { cva, type VariantProps } from 'class-variance-authority';
import { Check, Copy, X } from 'lucide-react';

export const cn = (...c: ClassValue[]) => twMerge(clsx(c));

// ------------------------------------------------------------------ Button
const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45',
  {
    variants: {
      variant: {
        default: 'bg-brand text-white shadow-[0_8px_24px_-10px_rgb(123_97_255/0.8)] hover:brightness-110',
        buy: 'bg-buy text-[#04130d] hover:brightness-110 shadow-[0_8px_24px_-12px_rgb(31_203_139/0.9)]',
        sell: 'bg-sell text-white hover:brightness-110 shadow-[0_8px_24px_-12px_rgb(255_77_106/0.9)]',
        outline: 'border border-border bg-transparent text-foreground hover:bg-muted',
        soft: 'bg-muted text-foreground hover:bg-surface',
        ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
        destructive: 'bg-sell/15 text-sell hover:bg-sell/25',
        link: 'h-auto p-0 text-primary underline-offset-4 hover:underline',
      },
      size: { default: 'h-11 px-5', sm: 'h-9 rounded-lg px-3.5 text-[13px]', lg: 'h-13 px-7 text-base', icon: 'h-10 w-10 rounded-lg' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { loading?: boolean }
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, loading, children, disabled, ...p }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...p}>
    {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
    {children}
  </button>
));
Button.displayName = 'Button';

// ------------------------------------------------------------------ Form controls
const control = 'flex h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-sm text-foreground placeholder:text-muted-foreground/70 transition-colors hover:border-muted-foreground/40 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 disabled:opacity-50';
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(control, className)} {...p} />
));
Input.displayName = 'Input';
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn(control, 'h-auto min-h-24 py-3', className)} {...p} />
));
Textarea.displayName = 'Textarea';
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...p }, ref) => (
  <select ref={ref} className={cn(control, 'cursor-pointer appearance-none bg-[length:16px] bg-[position:right_0.75rem_center] bg-no-repeat pe-9 rtl:bg-[position:left_0.75rem_center]', className)}
    style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%238a91a6' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...p} />
));
Select.displayName = 'Select';
export const Label = ({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) => <label className={cn('mb-1.5 block text-xs font-medium text-muted-foreground', className)} {...p} />;

/** Large amount field with a trailing unit, used in trade panels. */
export const AmountField = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode; unit: React.ReactNode; hint?: React.ReactNode }>(
  ({ label, unit, hint, className, id, ...p }, ref) => (
    <div className="rounded-2xl border border-border bg-surface px-4 py-3 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25">
      <div className="flex items-center justify-between text-xs text-muted-foreground"><label htmlFor={id}>{label}</label>{hint}</div>
      <div className="mt-1 flex items-center gap-3">
        <input ref={ref} id={id} inputMode="decimal" autoComplete="off" className={cn('num w-full min-w-0 bg-transparent text-2xl font-semibold outline-none placeholder:text-muted-foreground/40', className)} {...p} />
        <span className="shrink-0 text-sm font-semibold text-foreground">{unit}</span>
      </div>
    </div>
  ),
);
AmountField.displayName = 'AmountField';

// ------------------------------------------------------------------ Surfaces
export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('rounded-2xl border border-border bg-card text-card-foreground', className)} {...p} />;
export const CardHeader = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('flex flex-col gap-1.5 p-5 sm:p-6', className)} {...p} />;
export const CardTitle = ({ className, ...p }: React.HTMLAttributes<HTMLHeadingElement>) => <h3 className={cn('text-lg font-semibold leading-tight tracking-tight', className)} {...p} />;
export const CardContent = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('p-5 pt-0 sm:p-6 sm:pt-0', className)} {...p} />;

const badgeVariants = cva('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold leading-5', {
  variants: {
    variant: {
      default: 'bg-muted text-muted-foreground',
      success: 'bg-buy/15 text-buy',
      warning: 'bg-warn/15 text-warn',
      danger: 'bg-sell/15 text-sell',
      info: 'bg-primary/15 text-primary',
      outline: 'border border-border text-muted-foreground',
    },
  },
  defaultVariants: { variant: 'default' },
});
export const Badge = ({ className, variant, ...p }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) => <span className={cn(badgeVariants({ variant }), className)} {...p} />;

export const Alert = ({ className, variant = 'info', ...p }: React.HTMLAttributes<HTMLDivElement> & { variant?: 'info' | 'error' | 'success' | 'warning' }) => (
  <div role={variant === 'error' ? 'alert' : 'status'}
    className={cn('rounded-xl border px-3.5 py-2.5 text-sm leading-relaxed', {
      'border-sell/30 bg-sell/10 text-sell': variant === 'error', 'border-buy/30 bg-buy/10 text-buy': variant === 'success',
      'border-warn/30 bg-warn/10 text-warn': variant === 'warning', 'border-primary/30 bg-primary/10 text-foreground': variant === 'info',
    }, className)} {...p} />
);
export const Skeleton = ({ className }: { className?: string }) => <div className={cn('animate-pulse rounded-lg bg-muted', className)} />;

// ------------------------------------------------------------------ Navigation-ish
export function Tabs<T extends string>({ value, onChange, options, className, size = 'default' }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: React.ReactNode; className?: string; testId?: string }>; className?: string; size?: 'default' | 'lg' }) {
  return (
    <div role="tablist" className={cn('inline-flex rounded-xl bg-muted p-1', className)}>
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} data-testid={o.testId} onClick={() => onChange(o.value)}
          className={cn('rounded-lg font-semibold transition-all', size === 'lg' ? 'px-6 py-2.5 text-sm' : 'px-4 py-1.5 text-[13px]',
            value === o.value ? cn('bg-card text-foreground shadow-sm', o.className) : 'text-muted-foreground hover:text-foreground')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
/** Underlined tabs for page sections. */
export function LineTabs<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: React.ReactNode }>; className?: string }) {
  return (
    <div role="tablist" className={cn('flex gap-6 overflow-x-auto border-b border-border', className)}>
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={cn('-mb-px whitespace-nowrap border-b-2 pb-3 text-sm font-semibold transition-colors', value === o.value ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Identity
const GRADS = ['from-[#7b61ff] to-[#37c8ff]', 'from-[#ff7a59] to-[#ffb020]', 'from-[#1fcb8b] to-[#37c8ff]', 'from-[#ff4d6a] to-[#b061ff]', 'from-[#37c8ff] to-[#4f6bff]', 'from-[#ffb020] to-[#ff4d6a]'];
const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
export function Avatar({ name, seed, size = 36, online, className }: { name: string; seed?: string; size?: number; online?: boolean; className?: string }) {
  return (
    <span className={cn('relative inline-flex shrink-0', className)} style={{ width: size, height: size }}>
      <span className={cn('flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br font-bold uppercase text-white', GRADS[hash(seed ?? name) % GRADS.length])} style={{ fontSize: size * 0.4 }}>
        {(name.trim()[0] ?? '?')}
      </span>
      {online !== undefined && <span className={cn('absolute -bottom-0.5 -end-0.5 h-3 w-3 rounded-full border-2 border-card', online ? 'bg-buy' : 'bg-muted-foreground')} />}
    </span>
  );
}
const ASSET_STYLE: Record<string, { bg: string; glyph: string }> = { USDT: { bg: '#26a17b', glyph: '₮' }, BTC: { bg: '#f7931a', glyph: '₿' }, ETH: { bg: '#627eea', glyph: 'Ξ' } };
export function AssetIcon({ asset, size = 28, className }: { asset: string; size?: number; className?: string }) {
  const s = ASSET_STYLE[asset] ?? { bg: '#7b61ff', glyph: asset[0] ?? '?' };
  return <span aria-hidden className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white', className)} style={{ width: size, height: size, background: s.bg, fontSize: size * 0.55 }}>{s.glyph}</span>;
}
const CHIP_COLORS = ['#7b61ff', '#37c8ff', '#1fcb8b', '#ffb020', '#ff4d6a', '#ff7a59', '#4f6bff', '#b061ff'];
/** Payment-method chip with a stable colour per method. */
export function PayChip({ code, label, className }: { code: string; label?: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground/90', className)}>
      <span className="h-3 w-[3px] rounded-full" style={{ background: CHIP_COLORS[hash(code) % CHIP_COLORS.length] }} />
      {label ?? code.replace(/_/g, ' ')}
    </span>
  );
}
export function Logo({ className, size = 30 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-hidden>
      <defs><linearGradient id="p2p-lg" x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse"><stop stopColor="#7b61ff" /><stop offset="1" stopColor="#37c8ff" /></linearGradient></defs>
      <rect width="32" height="32" rx="9" fill="url(#p2p-lg)" />
      <path d="M9 12.5h11.5m0 0-3.2-3.2m3.2 3.2-3.2 3.2M23 19.5H11.5m0 0 3.2-3.2m-3.2 3.2 3.2 3.2" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ------------------------------------------------------------------ Feedback / overlays
export function Dialog({ open = true, onClose, title, children, className, testId }: { open?: boolean; onClose: () => void; title?: React.ReactNode; children: React.ReactNode; className?: string; testId?: string }) {
  React.useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" data-testid={testId} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cn('max-h-[92vh] w-full max-w-md animate-fade-up overflow-y-auto rounded-t-3xl border border-border bg-card shadow-2xl sm:rounded-3xl', className)}>
        <div className="flex items-center justify-between gap-3 px-5 pt-5 sm:px-6">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><X size={18} /></button>
        </div>
        <div className="p-5 sm:p-6">{children}</div>
      </div>
    </div>
  );
}
export function CopyButton({ value, className, label }: { value: string; className?: string; label?: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <button type="button" aria-label={label ?? 'Copy'} className={cn('inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground', className)}
      onClick={() => { void navigator.clipboard?.writeText(value); setDone(true); setTimeout(() => setDone(false), 1400); }}>
      {done ? <Check size={14} className="text-buy" /> : <Copy size={14} />}
    </button>
  );
}
export function Stat({ label, value, sub, className }: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-2xl border border-border bg-card p-4', className)}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="num mt-1 text-xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
/** Horizontal progress steps (order lifecycle). `current` is the index of the active step; -1 = none, steps.length = all done. */
export function Stepper({ steps, current, failed }: { steps: React.ReactNode[]; current: number; failed?: boolean }) {
  return (
    <ol className="flex w-full items-start">
      {steps.map((s, i) => {
        const done = i < current; const active = i === current;
        return (
          <li key={i} className="relative flex flex-1 flex-col items-center text-center">
            {i > 0 && <span className={cn('absolute end-1/2 top-3.5 -z-0 h-0.5 w-full', done || active ? 'bg-primary' : 'bg-border')} />}
            <span className={cn('relative z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold',
              done ? 'border-primary bg-primary text-white' : active ? (failed ? 'border-sell bg-sell/15 text-sell' : 'border-primary bg-background text-primary') : 'border-border bg-background text-muted-foreground')}>
              {done ? <Check size={14} /> : i + 1}
            </span>
            <span className={cn('mt-2 px-1 text-[11px] font-medium leading-tight sm:text-xs', done || active ? 'text-foreground' : 'text-muted-foreground')}>{s}</span>
          </li>
        );
      })}
    </ol>
  );
}
export const Divider = ({ className }: { className?: string }) => <hr className={cn('border-border', className)} />;
