/**
 * Number and Date Formatting Utilities
 *
 * Provides consistent, locale-aware formatting for production values and dates
 * throughout the dashboard.
 */

/**
 * Format a number with thousands separators and optional unit suffix
 * @param value - The number to format
 * @param options - Formatting options
 * @returns Formatted string
 */
export function formatNumber(
  value: number | null | undefined,
  options: {
    decimals?: number;
    unit?: string;
    compact?: boolean;
    locale?: string;
  } = {},
): string {
  if (value === null || value === undefined || isNaN(value)) {
    return "-";
  }

  const {
    decimals = 0,
    unit = "",
    compact = false,
    locale = "en-US",
  } = options;

  let formatted: string;

  if (compact) {
    // Compact notation for large numbers
    formatted = new Intl.NumberFormat(locale, {
      notation: "compact",
      maximumFractionDigits: decimals,
    }).format(value);
  } else {
    formatted = new Intl.NumberFormat(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  }

  return unit ? `${formatted} ${unit}` : formatted;
}

/**
 * Format a production volume in standard cubic meters (sm3)
 * Automatically uses compact notation for large values
 * @param value - Volume in sm3
 * @returns Formatted string with sm3 unit
 */
export function formatVolume(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) {
    return "-";
  }

  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M sm3`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K sm3`;
  }
  return `${value.toFixed(0)} sm3`;
}

/**
 * Format a volume for chart axis labels (short format without unit)
 * @param value - Volume value
 * @returns Formatted string (e.g., "1.5M", "250K")
 */
export function formatVolumeAxis(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(0)}K`;
  }
  return value.toFixed(0);
}

/**
 * Format a date for display
 * @param date - Date to format
 * @param format - Display format
 * @returns Formatted date string
 */
export function formatDate(
  date: Date | string | null | undefined,
  format: "short" | "medium" | "long" | "axis" = "medium",
): string {
  if (!date) {
    return "-";
  }

  const d = date instanceof Date ? date : new Date(date);

  if (isNaN(d.getTime())) {
    return "-";
  }

  const options: Intl.DateTimeFormatOptions = {};

  switch (format) {
    case "short":
      // e.g., "12/31/24"
      options.year = "2-digit";
      options.month = "numeric";
      options.day = "numeric";
      break;
    case "medium":
      // e.g., "Dec 31, 2024"
      options.year = "numeric";
      options.month = "short";
      options.day = "numeric";
      break;
    case "long":
      // e.g., "December 31, 2024"
      options.year = "numeric";
      options.month = "long";
      options.day = "numeric";
      break;
    case "axis":
      // e.g., "Dec 2024"
      options.year = "numeric";
      options.month = "short";
      break;
  }

  return d.toLocaleDateString("en-US", options);
}

/**
 * Format a date range for display
 * @param start - Start date
 * @param end - End date
 * @returns Formatted date range string
 */
export function formatDateRange(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined,
): string {
  const startStr = formatDate(start, "medium");
  const endStr = formatDate(end, "medium");

  if (startStr === "-" || endStr === "-") {
    return "-";
  }

  return `${startStr} - ${endStr}`;
}

/**
 * Format a percentage value
 * @param value - Value between 0 and 1 (or 0-100)
 * @param asRatio - If true, value is 0-1 ratio; if false, value is 0-100 percent
 * @returns Formatted percentage string
 */
export function formatPercent(
  value: number | null | undefined,
  asRatio: boolean = false,
): string {
  if (value === null || value === undefined || isNaN(value)) {
    return "-";
  }

  const percent = asRatio ? value * 100 : value;
  return `${percent.toFixed(1)}%`;
}

/**
 * Format a well name for display
 * Cleans up well identifiers for readable display
 * @param wellName - Raw well name/identifier
 * @returns Cleaned well name
 */
export function formatWellName(wellName: string | null | undefined): string {
  if (!wellName) {
    return "Unknown Well";
  }

  // Clean up common prefixes/suffixes if needed
  return wellName.trim();
}
