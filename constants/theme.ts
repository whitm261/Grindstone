/**
 * Dark-first design tokens (MovingWeight).
 */
export const theme = {
  colors: {
    background: '#0c0f14',
    surface: '#151a22',
    surfaceElevated: '#1c232e',
    border: '#2a3444',
    textPrimary: '#e8ecf1',
    textSecondary: '#9aa5b5',
    textMuted: '#5c6a7d',
    accent: '#2dd4bf',
    accentMuted: 'rgba(45, 212, 191, 0.15)',
    success: '#4ade80',
    successMuted: 'rgba(74, 222, 128, 0.12)',
    danger: '#f87171',
    dangerMuted: 'rgba(248, 113, 113, 0.12)',
    chartLine: '#2dd4bf',
    chartGrid: '#2a3444',
    chartLabel: '#9aa5b5',
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 22,
  },
  space: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  fontSize: {
    caption: 12,
    body: 15,
    title: 18,
    headline: 22,
    display: 28,
  },
} as const;

export type Theme = typeof theme;
