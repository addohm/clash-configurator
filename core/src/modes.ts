/** The three ways to use the page (PLAN.md Q11, Q22). Simple is the default. */
export const MODES = ['simple', 'advanced', 'scratch'] as const;

export type Mode = (typeof MODES)[number];

export const DEFAULT_MODE: Mode = 'simple';
