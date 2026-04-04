import type { Config } from "tailwindcss"

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          50:  "#f2f5fa",
          100: "#e4eaf4",
          200: "#c0ceE4",
          300: "#8aa4cc",
          400: "#5b7ab8",
          500: "#3a5a96",
          600: "#2a4578",
          700: "#1e3460",
          800: "#162848",
          900: "#0f1f3d",
          950: "#0a1428",
        },
        gold: {
          50:  "#fdf9ee",
          100: "#f8f0d4",
          200: "#eed898",
          300: "#e2c060",
          400: "#d4aa3a",
          500: "#c49828",
          600: "#a67c18",
          700: "#8a6610",
          800: "#6e5010",
          900: "#523c0c",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui"],
        mono: ["var(--font-geist-mono)", "ui-monospace"],
      },
      borderRadius: {
        DEFAULT: "8px",
        lg: "10px",
        xl: "12px",
        "2xl": "16px",
      },
      boxShadow: {
        card: "0 1px 3px rgba(15,31,61,0.06), 0 1px 2px rgba(15,31,61,0.04)",
        modal: "0 12px 48px rgba(15,31,61,0.14)",
        "gold-focus": "0 0 0 3px rgba(196,152,40,0.18)",
      },
      keyframes: {
        "pulse-dot": {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "pulse-dot": "pulse-dot 2s ease-in-out infinite",
        "fade-in":   "fade-in 0.18s ease-out",
      },
    },
  },
  plugins: [],
}

export default config
