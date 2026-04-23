export type ThemeId = 'midnight' | 'forest' | 'ember';

type ThemeColors = {
  background: string;
  surface: string;
  surfaceElevated: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentMuted: string;
  success: string;
  successMuted: string;
  danger: string;
  dangerMuted: string;
  chartLine: string;
  chartGrid: string;
  chartLabel: string;
 };

const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
} as const;

const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

const fontSize = {
  caption: 12,
  body: 15,
  title: 18,
  headline: 22,
  display: 28,
} as const;

export type AppTheme = {
  id: ThemeId;
  label: string;
  description: string;
  dark: true;
  colors: ThemeColors;
  radius: typeof radius;
  space: typeof space;
  fontSize: typeof fontSize;
};

function createTheme(
  id: ThemeId,
  label: string,
  description: string,
  colors: ThemeColors,
): AppTheme {
  return {
    id,
    label,
    description,
    dark: true,
    colors,
    radius,
    space,
    fontSize,
  };
}

export const builtInThemes = [
  createTheme('midnight', 'Midnight', 'Cool dark graphite with bright teal accents.', {
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
  }),
  createTheme('forest', 'Forest', 'Deep green neutrals with a sharper lime highlight.', {
    background: '#0b130f',
    surface: '#132019',
    surfaceElevated: '#1a2a22',
    border: '#294235',
    textPrimary: '#edf4ef',
    textSecondary: '#abc0b0',
    textMuted: '#718778',
    accent: '#84cc16',
    accentMuted: 'rgba(132, 204, 22, 0.16)',
    success: '#22c55e',
    successMuted: 'rgba(34, 197, 94, 0.12)',
    danger: '#fb7185',
    dangerMuted: 'rgba(251, 113, 133, 0.12)',
    chartLine: '#84cc16',
    chartGrid: '#294235',
    chartLabel: '#abc0b0',
  }),
  createTheme('ember', 'Ember', 'Warm slate surfaces with a bold orange training focus.', {
    background: '#15100d',
    surface: '#211915',
    surfaceElevated: '#2c221c',
    border: '#47342a',
    textPrimary: '#f5ede8',
    textSecondary: '#c4aea0',
    textMuted: '#8f7465',
    accent: '#fb923c',
    accentMuted: 'rgba(251, 146, 60, 0.16)',
    success: '#34d399',
    successMuted: 'rgba(52, 211, 153, 0.12)',
    danger: '#f87171',
    dangerMuted: 'rgba(248, 113, 113, 0.14)',
    chartLine: '#fb923c',
    chartGrid: '#47342a',
    chartLabel: '#c4aea0',
  }),
] as const satisfies readonly AppTheme[];

export const defaultThemeId: ThemeId = 'midnight';

const themeMap = new Map<ThemeId, AppTheme>(builtInThemes.map((item) => [item.id, item]));

export function getThemeById(themeId: string | null | undefined): AppTheme {
  if (!themeId) return themeMap.get(defaultThemeId)!;
  return themeMap.get(themeId as ThemeId) ?? themeMap.get(defaultThemeId)!;
}

export const theme = getThemeById(defaultThemeId);
