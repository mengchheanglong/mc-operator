/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        core: {
          primary: "#5B8DEF",
          accent: "#A78BFA",
          success: "#34D399",
          warning: "#F59E0B",
        },
        surface: {
          base: "#F7F8FC",
          sidebar: "#EBEEFB",
          card: "#FFFFFF",
        },
      },
      fontFamily: {
        sans: [
          "Sora",
          "Manrope",
          "Plus Jakarta Sans",
          "Segoe UI",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 10px 30px -18px rgba(15, 23, 42, 0.24)",
        lift: "0 18px 34px -22px rgba(91, 141, 239, 0.38)",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: 0, transform: "translateY(6px)" },
          to: { opacity: 1, transform: "translateY(0)" },
        },
        slideUp: {
          from: { opacity: 0, transform: "translateY(10px)" },
          to: { opacity: 1, transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fadeIn 320ms ease-out",
        "slide-up": "slideUp 280ms ease-out",
      },
    },
  },
  plugins: [],
};
