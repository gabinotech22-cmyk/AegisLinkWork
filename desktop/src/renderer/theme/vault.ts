export interface Theme {
  name: 'Work';
  dark: boolean;
  // Colors
  bg: string;
  surface: string;
  surface2: string;
  surface3: string;
  border: string;
  borderStrong: string;
  text: string;
  textDim: string;
  textFaint: string;
  accent: string;
  accentDeep: string;
  accentInk: string;
  danger: string;
  warn: string;
  divider: string;
  bubbleIn: string;
  bubbleInText: string;
  bubbleOut: string;
  bubbleOutText: string;
  // Shape
  radius: number;
  radiusS: number;
  radiusL: number;
  // Fonts
  font: string;
  fontMono: string;
  fontDisplay: string;
}

const fontMono = 'Menlo, Consolas, monospace';
const fontDisplay = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const baseShape = {
  name: 'Work' as const,
  radius: 14,
  radiusS: 8,
  radiusL: 22,
  font: fontDisplay,
  fontMono,
  fontDisplay,
};

export const VAULT_DARK: Theme = {
  ...baseShape,
  dark: true,
  bg: '#0b0a12',
  surface: '#14121f',
  surface2: '#1d1a2c',
  surface3: '#282438',
  border: 'rgba(255,255,255,0.07)',
  borderStrong: 'rgba(255,255,255,0.14)',
  text: '#eeeaf7',
  textDim: 'rgba(238,234,247,0.58)',
  textFaint: 'rgba(238,234,247,0.32)',
  accent: '#8b5cf6',
  accentDeep: '#5b3bb8',
  accentInk: '#150a2e',
  danger: '#ff6b6b',
  warn: '#f0c674',
  divider: 'rgba(255,255,255,0.05)',
  bubbleIn: '#1d1a2c',
  bubbleInText: '#eeeaf7',
  bubbleOut: '#8b5cf6',
  bubbleOutText: '#f7f3ff',
};

export const VAULT_LIGHT: Theme = {
  ...baseShape,
  dark: false,
  bg: '#f4f2f9',
  surface: '#ffffff',
  surface2: '#ebe7f3',
  surface3: '#d9d3e8',
  border: 'rgba(21,10,46,0.08)',
  borderStrong: 'rgba(21,10,46,0.20)',
  text: '#150a2e',
  textDim: 'rgba(21,10,46,0.58)',
  textFaint: 'rgba(21,10,46,0.32)',
  accent: '#6d28d9',
  accentDeep: '#4c1d95',
  accentInk: '#ffffff',
  danger: '#b8442a',
  warn: '#a87f1f',
  divider: 'rgba(21,10,46,0.06)',
  bubbleIn: '#ebe7f3',
  bubbleInText: '#150a2e',
  bubbleOut: '#6d28d9',
  bubbleOutText: '#ffffff',
};
