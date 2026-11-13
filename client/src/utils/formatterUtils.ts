type Numeric = number | string | null | undefined;
const numeric = (value: Numeric) => value == null || (typeof value === 'string' && !value.trim()) ? NaN : Number(value);
const trimZeros = (value: string) => value.includes('.') ? value.replace(/\.?0+$/, '') : value;
const boundedDigits = (value: number, min: number, max: number) => Number.isFinite(value) ? Math.max(min, Math.min(max, Math.trunc(value))) : min;
const COMPACT_UNITS = ['', 'K', 'M', 'B', 'T'] as const;

/** Compact values use three significant digits, carrying rounded values into the next unit. */
export function formatNumber(value?: Numeric, options?: { compact?: boolean; prefix?: string; precision?: number; addCommas?: boolean }): string {
  const number = numeric(value);
  if (!Number.isFinite(number)) return '—';
  const { compact = false, prefix = '', precision, addCommas = true } = options ?? {};
  let amount = Math.abs(number), unit = 0;
  if (compact) {
    while (amount >= 1000 && unit < COMPACT_UNITS.length - 1) { amount /= 1000; unit++; }
  }
  const decimals = () => precision == null
    ? compact && amount >= 1 ? Math.max(0, 2 - Math.floor(Math.log10(amount))) : getAppropriateDecimals(amount)
    : boundedDigits(precision, 0, 20);
  let digits = decimals();
  // Carry only when the displayed value rounds to 1000, respecting explicit precision.
  if (compact && Number(amount.toFixed(digits)) >= 1000 && unit < COMPACT_UNITS.length - 1) { amount /= 1000; unit++; digits = decimals(); }
  let formatted = trimZeros(amount.toFixed(digits));
  if (!unit && addCommas) {
    const [whole, fraction] = formatted.split('.');
    formatted = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction ? '.' + fraction : '');
  }
  return (number < 0 && Number(amount.toFixed(digits)) !== 0 ? '−' : '') + prefix + formatted + COMPACT_UNITS[unit];
}

const subscript = (count: number) => String(count).replace(/\d/g, digit => '₀₁₂₃₄₅₆₇₈₉'[Number(digit)]);

/** Tiny prices compress leading zeros: $0.0000123 → $0.0₄123. Token decimals do not set USD precision. */
export function formatPrice(value?: Numeric, options?: { prefix?: string; significant?: number; threshold?: number }): string {
  const number = numeric(value);
  if (!Number.isFinite(number)) return '—';
  const { prefix = '', significant = 3, threshold = 0.001 } = options ?? {};
  const amount = Math.abs(number);
  if (amount > 0 && amount < threshold) {
    const [mantissa, exponent] = amount.toExponential(boundedDigits(significant, 1, 6) - 1).split('e');
    const zeros = -Number(exponent) - 1;
    // Rounding may promote a tiny value back across the notation threshold.
    if (zeros > 0 && Number(mantissa + 'e' + exponent) < threshold) return (number < 0 ? '−' : '') + prefix + '0.0' + subscript(zeros) + mantissa.replace('.', '').replace(/0+$/, '');
  }
  return formatNumber(number, { prefix, precision: getAppropriateDecimals(amount) });
}

export const formatMarketCap = (value?: Numeric) => formatNumber(value, { compact: true, prefix: '$' });

export function formatPercentChange(value?: number | null, options?: { compact?: boolean; precision?: number }): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${formatNumber(value, { compact: options?.compact, precision: options?.precision ?? 1, addCommas: false })}%`;
}

// Calculate log-scale percentage position of a value between min and max
export const calculateLogPercentage = (
  value: number,
  min: number,
  max: number
): number => {
  const logMin = Math.log(min);
  const logMax = Math.log(max);
  const logValue = Math.log(value);
  const rawPercentage = ((logValue - logMin) / (logMax - logMin)) * 100;
  return Math.max(0, Math.min(100, rawPercentage));
};

// Calculate price from percentage using log scale
export const calculatePriceFromPercentage = (
  percentage: number,
  min: number,
  max: number
): number => {
  const logMin = Math.log(min);
  const logMax = Math.log(max);
  return Math.exp(logMin + (percentage / 100) * (logMax - logMin));
};

// Determine appropriate decimal places based on price magnitude
export const getAppropriateDecimals = (price: number): number => {
  price = Math.abs(price);
  if (price < 0.0001) return 8;
  if (price < 0.01) return 6;
  if (price < 1) return 4;
  if (price < 1000) return 2;
  if (price < 10000) return 1;
  return 0;
};

export const formatRelativeTime = (date: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);
  if (diffHr < 1) {
    if (diffMin < 1) return `${diffSec}s`;
    return `${diffMin}m`;
  }
  if (diffDays < 1) {
    if (diffHr < 1) {
      return '<1h';
    }
    return `${diffHr}h`;
  }

  if (diffDays < 30) return `${diffDays}d`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo`;
  return `${Math.floor(diffDays / 365)}y`;
};

// Shorthand for recent times; absolute date if older than ~1.5 months
export const formatRecentOrDate = (timestamp: number) => {
  const now = Date.now();
  const diffDays = (now - timestamp) / (1000 * 60 * 60 * 24);
  if (diffDays <= 45) return formatRelativeTime(new Date(timestamp));
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

// HH:MM clock time — chat-message timestamp style
export const formatClockTime = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// Day separator label: Today / Yesterday / "Jul 3" — chat day divider style
export const formatDayLabel = (timestamp: number) => {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

export function formatAgeMs(ageMs: number): string {
  if (ageMs < 0) return '<1s';
  const ageSeconds = Math.floor(ageMs / 1000);
  if (ageSeconds < 1) return '<1s';
  if (ageSeconds < 60) return `${ageSeconds}s`;
  const ageMinutes = Math.floor(ageMs / (1000 * 60));
  if (ageMinutes < 60) return `${ageMinutes}m`;
  const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
  if (ageHours < 24) return `${ageHours}h`;
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
  if (ageDays < 30) return `${ageDays}d`;
  if (ageDays < 365) return `${Math.floor(ageDays / 30)}mo`;
  return `${Math.floor(ageDays / 365)}y`;
}
