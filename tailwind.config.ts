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
        // Control-room surfaces
        ink: {
          950: "#0a0c12",
          900: "#0f121a",
          850: "#141824",
          800: "#1a1f2e",
          700: "#252b3d",
          600: "#333a4f",
        },
        brand: {
          DEFAULT: "#6366f1",
          50: "#eef2ff",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
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
      keyframes: {
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
      },
      animation: {
        "pulse-soft": "pulse-soft 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
