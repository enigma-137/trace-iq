import type { Config } from 'tailwindcss';
import colors from 'tailwindcss/colors';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // The dashboard previously used Tailwind's blue-tinted slate scale for
        // dark surfaces. Mapping it to the neutral scale keeps existing utility
        // classes intact while giving every dashboard page a true black feel.
        slate: colors.neutral,
        background: '#050505',
        foreground: '#f4f4f5',
        border: 'rgba(255, 255, 255, 0.07)'
      },
      fontFamily: {
        sans: ['var(--font-dm-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-ibm-plex-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace']
      }
    }
  },
  plugins: []
};

export default config;
