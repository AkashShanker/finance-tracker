/**
 * Chart color tokens — reference CSS variables from globals.css
 * so colors adapt automatically to light/dark mode.
 */

const v = (name: string) => `var(--${name})`;

/** Semantic colors for fixed-meaning chart elements */
export const CHART = {
  positive: v("chart-positive"),   // assets, income, net-worth-up
  negative: v("chart-negative"),   // debt, expenses, net-worth-down
  neutral:  v("chart-neutral"),    // net worth line, informational
  warning:  v("chart-warning"),    // credit card debt, alerts
} as const;

/** Rotating palette for dynamic series (individual debts, assets, etc.) */
export const PALETTE = [
  "chart-1", "chart-2", "chart-3", "chart-4", "chart-5", "chart-6",
  "chart-7", "chart-8", "chart-9", "chart-10", "chart-11", "chart-12",
].map(v);
