export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: '#E95000',
          50:  '#FFF4ED',
          100: '#FFE4D1',
          200: '#FFC49E',
          300: '#FF9B61',
          400: '#FF7430',
          500: '#E95000',
          600: '#C43F00',
          700: '#983200',
          800: '#732900',
          900: '#4A1A00',
        },
        primary: {
          900: '#050505',
        },
        ink: {
          700: '#27272A',
          800: '#18181B',
          900: '#09090B',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans JP', 'system-ui', 'sans-serif'],
        display: ['Inter', 'Noto Sans JP', 'system-ui', 'sans-serif'],
        serif: ['Inter', 'Noto Sans JP', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.4s ease-out',
      },
      boxShadow: {
        'glow-accent': '0 0 30px -6px rgba(233, 80, 0, 0.45)',
        'glow-accent-lg': '0 18px 50px -20px rgba(233, 80, 0, 0.75)',
      },
      textShadow: {
        display: '0 18px 60px rgba(0,0,0,0.75)',
      },
    },
  },
  plugins: [
    ({ addUtilities }) => {
      addUtilities({
        '.display-shadow': {
          textShadow: '0 18px 60px rgba(0,0,0,0.75)',
        },
      });
    },
  ],
};
