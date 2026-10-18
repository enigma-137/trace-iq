import type { Config } from 'tailwindcss';
import colors from 'tailwindcss/colors';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // The dashboard previously used Tailwind's blue-tinted slate scale for
        // dark surfaces. Mapping it to the neutral scale keeps existing utility
        // classes intact while giving every dashboard page a true black feel.
        slate: { ...colors.neutral, 850: '#1f1f1f' },
        // Tailwind has no 850 shade; dark-mode surfaces use it between 800 and
        // 900. Without it every `dark:bg-neutral-850` class silently does
        // nothing and the light background shows through.
        neutral: { ...colors.neutral, 850: '#1f1f1f' },
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
