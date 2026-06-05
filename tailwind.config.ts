import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Control-room surfaces — deep, cool, layered
        ink: {
          950: "#07080d",
          900: "#0b0d14",
          850: "#11131c",
          800: "#171a26",
          700: "#222636",
          600: "#323849",
        },
        // Signature iris-violet — richer + more electric than stock indigo
        brand: {
          DEFAULT: "#7c6cff",
          50: "#f1efff",
          300: "#bcb2ff",
          400: "#9d8eff",
          500: "#7c6cff",
          600: "#6a51f0",
          700: "#5836d6",
        },
        // Secondary accent for data + highlights
        accent: {
          DEFAULT: "#34d2ff",
          400: "#5cdcff",
          500: "#34d2ff",
        },
        // Semantic health — the red/yellow/green the brief asks for
        ok: { DEFAULT: "#10b981", soft: "#064e3b" },
        warn: { DEFAULT: "#f59e0b", soft: "#78350f" },
        bad: { DEFAULT: "#ef4444", soft: "#7f1d1d" },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(124,108,255,0.35), 0 10px 30px -10px rgba(124,108,255,0.55)",
        card: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 1px 2px rgba(0,0,0,0.4), 0 16px 40px -24px rgba(0,0,0,0.85)",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #7c6cff 0%, #6a51f0 50%, #5836d6 100%)",
      },
      keyframes: {
        "pulse-soft": { "0%, 100%": { opacity: "1" }, "50%": { opacity: "0.5" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
        "fade-up": { "0%": { opacity: "0", transform: "translateY(6px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
      },
      animation: {
        "pulse-soft": "pulse-soft 2s ease-in-out infinite",
        shimmer: "shimmer 1.6s infinite",
        "fade-up": "fade-up 0.35s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
