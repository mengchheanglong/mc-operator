'use client';

import type { ComponentType, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { format, formatDistanceToNow, isValid, parseISO } from 'date-fns';
import { X } from 'lucide-react';

/* ==========================================================================
   Mission Control — UI Primitives
   A world-class component library for the operator control plane.
   All legacy exports are preserved for backward compatibility; new components
   are added below. Uses the design tokens defined in globals.css.
   ========================================================================== */

type IconComponent = ComponentType<{ className?: string }>;

function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

/* ---------------------------------------------------------------------------
   Tone maps (shared across Badge, Button, StatusDot, etc.)
   --------------------------------------------------------------------------- */

export type Tone = 'blue' | 'slate' | 'green' | 'amber' | 'red' | 'purple' | 'cyan';

const toneText: Record<Tone, string> = {
  blue: 'text-blue-200',
  slate: 'text-slate-300',
  green: 'text-emerald-200',
  amber: 'text-amber-200',
  red: 'text-rose-200',
  purple: 'text-violet-200',
  cyan: 'text-cyan-200',
};

const toneDot: Record<Tone, string> = {
  blue: 'bg-[var(--accent-blue)]',
  slate: 'bg-slate-400',
  green: 'bg-[var(--accent-emerald)]',
  amber: 'bg-[var(--accent-amber)]',
  red: 'bg-[var(--accent-rose)]',
  purple: 'bg-[var(--accent-violet)]',
  cyan: 'bg-[var(--accent-cyan)]',
};

const toneGlow: Record<Tone, string> = {
  blue: 'mc-shadow-glow-blue',
  slate: 'mc-shadow-glow-slate',
  green: 'mc-shadow-glow-green',
  amber: 'mc-shadow-glow-amber',
  red: 'mc-shadow-glow-red',
  purple: 'mc-shadow-glow-purple',
  cyan: 'mc-shadow-glow-cyan',
};

/* ---------------------------------------------------------------------------
   Button
   --------------------------------------------------------------------------- */

type ButtonTones = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';

const buttonTones: Record<ButtonTones, string> = {
  primary:
    'border-blue-400/35 bg-blue-500/90 text-white mc-shadow-glow-blue hover:border-blue-300/70 hover:bg-blue-400 focus-visible:ring-blue-400/25',
  secondary:
    'border-white/10 bg-white/[0.06] text-slate-100 hover:border-white/18 hover:bg-white/[0.1] focus-visible:ring-white/15',
  ghost:
    'border-transparent bg-transparent text-slate-300 hover:bg-white/[0.07] hover:text-white focus-visible:ring-white/15',
  danger:
    'border-red-400/25 bg-red-500/10 text-red-200 hover:border-red-300/45 hover:bg-red-500/16 focus-visible:ring-red-400/20',
  success:
    'border-emerald-400/25 bg-emerald-500/10 text-emerald-200 hover:border-emerald-300/45 hover:bg-emerald-500/16 focus-visible:ring-emerald-400/20',
};

export function Button({
  children,
  className,
  icon: Icon,
  tone = 'primary',
  type = 'button',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: IconComponent;
  tone?: ButtonTones;
}) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-3.5 text-sm font-semibold leading-none outline-none transition disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-4',
        buttonTones[tone],
        className,
      )}
      {...props}
    >
      {Icon && <Icon className="h-4 w-4" />}
      <span>{children}</span>
    </button>
  );
}

export function IconButton({
  className,
  icon: Icon,
  tone = 'ghost',
  type = 'button',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: IconComponent;
  tone?: ButtonTones;
}) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-lg border outline-none transition disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-4',
        buttonTones[tone],
        className,
      )}
      {...props}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

/* ---------------------------------------------------------------------------
   PageHeader (legacy — preserved)
   --------------------------------------------------------------------------- */

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-white/8 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-blue-200/70">
            {eyebrow}
          </p>
        )}
        <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{title}</h2>
        {description && <p className="mt-2 max-w-2xl text-sm text-slate-400">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   SectionHeading — a lighter, inline section label with optional action
   --------------------------------------------------------------------------- */

export function SectionHeading({
  title,
  icon: Icon,
  description,
  action,
  className,
}: {
  title: string;
  icon?: IconComponent;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon && (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.05] text-blue-200">
            <Icon className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold tracking-tight text-slate-100">{title}</h3>
          {description && <p className="mt-0.5 truncate text-xs text-slate-500">{description}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Surface (legacy — preserved) + Card (richer card with header/body/footer)
   --------------------------------------------------------------------------- */

export function Surface({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'mc-surface',
        className,
      )}
    >
      {children}
    </section>
  );
}

export function Card({
  children,
  className,
  as: Tag = 'section',
  interactive = false,
  padding = 'md',
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'article' | 'div';
  interactive?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}) {
  const pad = padding === 'none' ? '' : padding === 'sm' ? 'p-3' : padding === 'lg' ? 'p-6' : 'p-4';
  return (
    <Tag
      className={cn(
        'mc-card',
        interactive && 'mc-card-interactive',
        pad,
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  icon: Icon,
  eyebrow,
  description,
  action,
  className,
}: {
  title: ReactNode;
  icon?: IconComponent;
  eyebrow?: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-3 border-b border-white/8 px-5 py-4',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {Icon && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] text-blue-200 mc-shadow-xs">
            <Icon className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              {eyebrow}
            </p>
          )}
          <h3 className="truncate text-base font-semibold tracking-tight text-white">{title}</h3>
          {description && <p className="mt-0.5 text-sm text-slate-400">{description}</p>}
        </div>
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('px-5 py-4', className)}>{children}</div>;
}

export function CardFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center justify-end gap-2 border-t border-white/8 px-5 py-3',
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   StatCard / MetricCard — the operator dashboard's primary unit
   --------------------------------------------------------------------------- */

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'blue',
  hint,
  trend,
  className,
}: {
  label: string;
  value: ReactNode;
  icon?: IconComponent;
  tone?: Tone;
  hint?: ReactNode;
  trend?: { value: string; direction: 'up' | 'down' | 'flat' };
  className?: string;
}) {
  return (
    <Card padding="md" className={cn('relative overflow-hidden', className)}>
      <div
        className={cn(
          'pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full opacity-[0.07] blur-2xl',
          toneDot[tone],
        )}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-white tabular-nums">
            {value}
          </p>
          {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
        </div>
        {Icon && (
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05]',
              toneText[tone],
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      {trend && (
        <div className="mt-3 flex items-center gap-1.5 text-xs">
          <span
            className={cn(
              'inline-flex items-center gap-0.5 font-semibold tabular-nums',
              trend.direction === 'up' && 'text-emerald-300',
              trend.direction === 'down' && 'text-rose-300',
              trend.direction === 'flat' && 'text-slate-400',
            )}
          >
            {trend.direction === 'up' && '↑'}
            {trend.direction === 'down' && '↓'}
            {trend.direction === 'flat' && '→'}
            {trend.value}
          </span>
        </div>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------------------
   Toolbar (legacy — preserved)
   --------------------------------------------------------------------------- */

export function Toolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('grid gap-3 border-b border-white/8 px-5 py-4 lg:flex lg:items-center', className)}>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Badge (legacy — preserved) + StatusBadge
   --------------------------------------------------------------------------- */

type BadgeTone = Tone;

const badgeTones: Record<BadgeTone, string> = {
  blue: 'border-blue-300/20 bg-blue-400/10 text-blue-100',
  slate: 'border-white/10 bg-white/[0.06] text-slate-300',
  green: 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100',
  amber: 'border-amber-300/20 bg-amber-400/10 text-amber-100',
  red: 'border-red-300/20 bg-red-400/10 text-red-100',
  purple: 'border-violet-300/20 bg-violet-400/10 text-violet-100',
  cyan: 'border-cyan-300/20 bg-cyan-400/10 text-cyan-100',
};

export function Badge({
  children,
  tone = 'slate',
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-md border px-2 text-xs font-semibold leading-none',
        badgeTones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({
  children,
  tone = 'slate',
  pulse = false,
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.05] px-2 text-xs font-semibold leading-none text-slate-200',
        className,
      )}
    >
      <span className={cn('relative h-1.5 w-1.5 rounded-full', toneDot[tone], pulse && 'mc-pulse')} />
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------------------
   StatusDot — a compact live indicator
   --------------------------------------------------------------------------- */

export function StatusDot({
  tone = 'slate',
  pulse = false,
  size = 'md',
  className,
  label,
}: {
  tone?: Tone;
  pulse?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  label?: string;
}) {
  const dim = size === 'sm' ? 'h-1.5 w-1.5' : size === 'lg' ? 'h-3 w-3' : 'h-2 w-2';
  return (
    <span
      className={cn('inline-flex items-center gap-2', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      <span
        className={cn(
          'relative rounded-full',
          dim,
          toneDot[tone],
          pulse && toneGlow[tone],
          pulse && 'mc-blink',
        )}
      />
      {label && <span className="text-xs font-medium text-slate-300">{label}</span>}
    </span>
  );
}

/* ---------------------------------------------------------------------------
   Field (legacy — preserved) + input class strings
   --------------------------------------------------------------------------- */

export function Field({
  icon: Icon,
  className,
  children,
}: {
  icon?: IconComponent;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('relative', className)}>
      {Icon && (
        <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
      )}
      {children}
    </div>
  );
}

export const inputClassName =
  'h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-blue-300/55 focus:ring-4 focus:ring-blue-400/15';

export const iconInputClassName = cn(inputClassName, 'pl-9');

export const textareaClassName =
  'w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-blue-300/55 focus:ring-4 focus:ring-blue-400/15';

/* ---------------------------------------------------------------------------
   LabeledField — accessible wrapper with a real <label>
   --------------------------------------------------------------------------- */

export function LabeledField({
  label,
  hint,
  required = false,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label
        htmlFor={htmlFor}
        className="flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400"
      >
        {label}
        {required && <span className="text-rose-400">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   SearchInput — filter input with clear button
   --------------------------------------------------------------------------- */

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search...',
  className,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      <svg
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={iconInputClassName}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-slate-500 transition hover:bg-white/10 hover:text-slate-200"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Select — styled native select with chevron
   --------------------------------------------------------------------------- */

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { className?: string }) {
  return (
    <div className={cn('relative', className)}>
      <select
        {...props}
        className={cn(inputClassName, 'appearance-none pr-9')}
      />
      <svg
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Divider
   --------------------------------------------------------------------------- */

export function Divider({ className, label }: { className?: string; label?: string }) {
  if (label) {
    return (
      <div className={cn('flex items-center gap-3', className)}>
        <div className="h-px flex-1 bg-white/8" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
          {label}
        </span>
        <div className="h-px flex-1 bg-white/8" />
      </div>
    );
  }
  return <div className={cn('h-px bg-white/8', className)} />;
}

/* ---------------------------------------------------------------------------
   KeyValue / DescriptionList — for detail panels
   --------------------------------------------------------------------------- */

export function KeyValue({
  label,
  children,
  mono = false,
  className,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 py-2', className)}>
      <dt className="shrink-0 text-xs font-medium uppercase tracking-[0.1em] text-slate-500">
        {label}
      </dt>
      <dd
        className={cn(
          'min-w-0 text-right text-sm text-slate-200',
          mono && 'font-mono text-[13px] text-slate-300',
        )}
      >
        {children}
      </dd>
    </div>
  );
}

export function DescriptionList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <dl className={cn('divide-y divide-white/6', className)}>{children}</dl>;
}

/* ---------------------------------------------------------------------------
   ProgressBar
   --------------------------------------------------------------------------- */

export function ProgressBar({
  value,
  max = 100,
  tone = 'blue',
  className,
  showLabel = false,
}: {
  value: number;
  max?: number;
  tone?: Tone;
  className?: string;
  showLabel?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0));
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/8">
        <div
          className={cn('h-full rounded-full transition-[width] duration-500 ease-out', toneDot[tone])}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-400">
          {Math.round(pct)}%
        </span>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Spinner
   --------------------------------------------------------------------------- */

export function Spinner({
  size = 'md',
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const dim = size === 'sm' ? 'h-3.5 w-3.5' : size === 'lg' ? 'h-6 w-6' : 'h-4 w-4';
  return (
    <svg
      className={cn('mc-spinner text-blue-300', dim, className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.2" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ---------------------------------------------------------------------------
   Skeleton — shimmer placeholders
   --------------------------------------------------------------------------- */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('mc-skeleton rounded-md', className)} />;
}

export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn('h-3', i === lines - 1 ? 'w-2/3' : 'w-full')}
        />
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Timestamp — formatted dates with date-fns
   --------------------------------------------------------------------------- */

export function Timestamp({
  value,
  format: fmt = 'relative',
  className,
  fallback = '—',
}: {
  value: string | number | Date | null | undefined;
  format?: 'relative' | 'datetime' | 'date' | 'time';
  className?: string;
  fallback?: string;
}) {
  if (value == null || value === '') return <span className={className}>{fallback}</span>;
  const date = value instanceof Date ? value : typeof value === 'number' ? new Date(value) : parseISO(value);
  if (!isValid(date)) return <span className={className}>{fallback}</span>;
  const text =
    fmt === 'relative'
      ? formatDistanceToNow(date, { addSuffix: true })
      : fmt === 'datetime'
        ? format(date, 'MMM d, yyyy · HH:mm')
        : fmt === 'date'
          ? format(date, 'MMM d, yyyy')
          : format(date, 'HH:mm:ss');
  return (
    <time dateTime={date.toISOString()} className={cn('tabular-nums', className)} title={format(date, 'PPpp')}>
      {text}
    </time>
  );
}

/* ---------------------------------------------------------------------------
   Tabs / SegmentedControl
   --------------------------------------------------------------------------- */

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
  size = 'md',
}: {
  tabs: Array<{ value: T; label: ReactNode; icon?: IconComponent; count?: number }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex items-center gap-1 rounded-lg border border-white/8 bg-white/[0.03] p-1',
        className,
      )}
    >
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(tab.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md font-semibold transition focus-visible:ring-4 focus-visible:ring-blue-400/20',
              size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-sm',
              active
                ? 'bg-white/[0.08] text-white mc-shadow-xs'
                : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200',
            )}
          >
            {tab.icon && <tab.icon className="h-3.5 w-3.5" />}
            {tab.label}
            {tab.count != null && (
              <span
                className={cn(
                  'ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded px-1 text-[10px] font-bold tabular-nums',
                  active ? 'bg-blue-400/20 text-blue-100' : 'bg-white/8 text-slate-400',
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Modal / Dialog — portal-based, escape to close, focus trap-friendly
   --------------------------------------------------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const mounted = useMounted();
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  const width =
    size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : size === 'xl' ? 'max-w-4xl' : 'max-w-lg';

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === 'string' ? title : undefined}
      className="fixed inset-0 mc-z-modal flex items-center justify-center p-4"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm mc-animate-fade-in"
        onClick={onClose}
      />
      <div
        className={cn(
          'relative w-full overflow-hidden rounded-xl border border-white/12 bg-[linear-gradient(180deg,rgba(22,26,38,0.98),rgba(14,17,25,0.98))] mc-shadow-xl mc-animate-scale-in',
          width,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/8 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight text-white">{title}</h2>
            {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
          </div>
          <IconButton icon={X} onClick={onClose} tone="ghost" aria-label="Close dialog" />
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-white/8 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/* ---------------------------------------------------------------------------
   Tooltip — lightweight CSS hover tooltip (no JS positioning needed for top)
   --------------------------------------------------------------------------- */

export function Tooltip({
  content,
  children,
  side = 'top',
}: {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom';
}) {
  return (
    <span className="group/tt relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 mc-z-tooltip -translate-x-1/2 whitespace-nowrap rounded-md border border-white/12 bg-[var(--surface-3)] px-2 py-1 text-xs font-medium text-slate-200 opacity-0 mc-shadow-md transition-opacity duration-150 group-hover/tt:opacity-100',
          side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
        )}
      >
        {content}
      </span>
    </span>
  );
}

/* ---------------------------------------------------------------------------
   EmptyState (enhanced — optional action), ErrorState (enhanced — retry),
   LoadingState (enhanced — skeleton option). Legacy signatures preserved.
   --------------------------------------------------------------------------- */

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: IconComponent;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-white/12 px-6 py-12 text-center mc-animate-fade-in">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-blue-200 mc-shadow-xs">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <Surface className="border-rose-400/20 p-6 mc-animate-fade-in">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-rose-400/20 bg-rose-500/10 text-rose-300">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
            <path d="M12 9v4M12 17h.01" strokeLinecap="round" />
            <circle cx="12" cy="12" r="9" />
          </svg>
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="text-base font-semibold text-rose-100">{title}</h3>
          <p className="text-sm text-rose-200/70">{message}</p>
        </div>
        {onRetry && (
          <Button tone="secondary" onClick={onRetry} className="shrink-0">
            Retry
          </Button>
        )}
      </div>
    </Surface>
  );
}

export function LoadingState({ label }: { label: string }) {
  return (
    <Surface className="p-8">
      <div className="flex items-center gap-3 text-sm text-slate-400">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-blue-300 mc-shadow-glow-blue" />
        {label}
      </div>
    </Surface>
  );
}

/* Skeleton-based loading grid for dashboards and lists */
export function LoadingGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} padding="md">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-7 w-16" />
          <Skeleton className="mt-2 h-3 w-24" />
        </Card>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   PageContainer — consistent page-level layout wrapper
   --------------------------------------------------------------------------- */

export function PageContainer({
  children,
  className,
  width = 'default',
}: {
  children: ReactNode;
  className?: string;
  width?: 'default' | 'wide' | 'narrow';
}) {
  const maxW = width === 'wide' ? 'max-w-[1600px]' : width === 'narrow' ? 'max-w-3xl' : 'max-w-[1400px]';
  return (
    <div className={cn('mx-auto w-full space-y-6', maxW, className)}>{children}</div>
  );
}

/* ---------------------------------------------------------------------------
   useFocusVisibleReturn + useEscape — small hooks for page-level components
   --------------------------------------------------------------------------- */

export function useEscape(onEscape: () => void, active = true) {
  const ref = useRef(onEscape);
  useEffect(() => {
    ref.current = onEscape;
  }, [onEscape]);
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') ref.current();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [active]);
}
