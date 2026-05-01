import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        positive: "#16a34a",
        neutral: "#6b7280",
        negative: "#dc2626",
      },
    },
  },
  plugins: [],
};

export default config;
