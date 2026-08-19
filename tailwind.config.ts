import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        lotus: {
          50: "#FBF6F8",
          100: "#F7E3E9",
          200: "#EDCFD8",
          300: "#DFB5BF",
          400: "#CE8B9D",
          500: "#AC5B7D",
          600: "#9B406C",
          700: "#923A66",
          800: "#6E2C4D",
          900: "#4A1D34",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      letterSpacing: {
        brand: "0.22em",
      },
    },
  },
  plugins: [],
};

export default config;
