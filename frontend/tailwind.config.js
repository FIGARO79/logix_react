/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['"72"', '"72full"', 'Inter', 'Roboto', 'sans-serif'],
                inter: ['Inter', 'sans-serif'],
                print: ['Arial', 'Helvetica', 'sans-serif'],
            },
        },
    },
    plugins: [],
}
