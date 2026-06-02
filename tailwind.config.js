/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:      'hsl(var(--bg))',
        surface: 'hsl(var(--surface))',
        glass:   'hsl(var(--glass))',
        border:  'hsl(var(--border))',
        text:    'hsl(var(--text))',
        muted:   'hsl(var(--muted))',
        accent:  'hsl(var(--accent))',
        green:   'hsl(var(--green))',
        blue:    'hsl(var(--blue))',
        purple:  'hsl(var(--purple))',
        orange:  'hsl(var(--orange))',
        red:     'hsl(var(--red))',
      },
      fontFamily: {
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        mono:    ['JetBrains Mono', 'monospace'],
        display: ['SF Pro Display', 'Inter', 'sans-serif'],
      },
      borderRadius: {
        xl:  '16px',
        '2xl': '20px',
        '3xl': '28px',
      },
      backdropBlur: {
        xs: '4px',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in':    'fadeIn 0.3s ease-out',
        'slide-up':   'slideUp 0.3s ease-out',
        'ring-fill':  'ringFill 1s ease-out forwards',
      },
      keyframes: {
        fadeIn:   { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp:  { from: { transform: 'translateY(8px)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } },
        ringFill: { from: { 'stroke-dashoffset': '100%' }, to: {} },
      },
    },
  },
  plugins: [],
}
