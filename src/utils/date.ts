/**
 * Pure date and currency formatting helpers.
 * Uses local calendar components to avoid UTC timezone shift issues.
 */

export function getLocalTodayIsoDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getCurrentMonthDateRange(referenceDate: Date = new Date()): {
  startDate: string;
  endDate: string;
} {
  const year = referenceDate.getFullYear();
  const monthIndex = referenceDate.getMonth();
  const firstDay = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0);

  return {
    startDate: getLocalTodayIsoDate(firstDay),
    endDate: getLocalTodayIsoDate(lastDay),
  };
}

export function getMonthDateRangeFromYearMonth(
  year: number,
  monthIndex: number
): {
  startDate: string;
  endDate: string;
  label: string;
} {
  const firstDay = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0);
  const label = firstDay.toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });

  return {
    startDate: getLocalTodayIsoDate(firstDay),
    endDate: getLocalTodayIsoDate(lastDay),
    label,
  };
}

export function isValidPastOrTodayIsoDate(isoDate: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return false;
  }

  const [yearStr, monthStr, dayStr] = isoDate.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  if (year < 1970 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return false;
  }

  const todayIso = getLocalTodayIsoDate();
  return isoDate <= todayIso;
}

export function shiftIsoDateByDays(isoDate: string, deltaDays: number): string {
  const [yearStr, monthStr, dayStr] = isoDate.split('-');
  const date = new Date(Number(yearStr), Number(monthStr) - 1, Number(dayStr));
  date.setDate(date.getDate() + deltaDays);
  return getLocalTodayIsoDate(date);
}

export function formatReadableDate(isoDate: string): string {
  const todayIso = getLocalTodayIsoDate();
  const yesterdayIso = shiftIsoDateByDays(todayIso, -1);

  if (isoDate === todayIso) {
    return `Today (${isoDate})`;
  }
  if (isoDate === yesterdayIso) {
    return `Yesterday (${isoDate})`;
  }

  const [yearStr, monthStr, dayStr] = isoDate.split('-');
  const date = new Date(Number(yearStr), Number(monthStr) - 1, Number(dayStr));
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }

  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatCompactDate(isoDate: string): string {
  const todayIso = getLocalTodayIsoDate();
  const yesterdayIso = shiftIsoDateByDays(todayIso, -1);

  if (isoDate === todayIso) {
    return 'Today';
  }
  if (isoDate === yesterdayIso) {
    return 'Yesterday';
  }

  const [yearStr, monthStr, dayStr] = isoDate.split('-');
  const date = new Date(Number(yearStr), Number(monthStr) - 1, Number(dayStr));
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }

  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
}

export function formatCurrencyAmount(
  amount: number,
  currencyCode: string = 'INR'
): string {
  const symbolMap: Record<string, string> = {
    INR: '₹',
    USD: '$',
    EUR: '€',
    GBP: '£',
  };
  const code = currencyCode.toUpperCase();
  const symbol = symbolMap[code] ?? `${code} `;
  const numeric = Number(amount || 0);
  const hasDecimals = Math.abs(numeric % 1) > 0.001;
  const formatted = numeric.toLocaleString('en-IN', {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return `${symbol}${formatted}`;
}

