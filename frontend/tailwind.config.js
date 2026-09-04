/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['"Segoe UI"', 'Segoe', '-apple-system', 'BlinkMacSystemFont', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
                'segoe-ui': ['"Segoe UI"', 'Segoe', '-apple-system', 'BlinkMacSystemFont', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
                segoe: ['"Segoe UI"', 'Segoe', '-apple-system', 'BlinkMacSystemFont', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
                inter: ['"Segoe UI"', 'Segoe', '-apple-system', 'BlinkMacSystemFont', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
                mono: ['Consolas', '"Segoe UI Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', '"Courier New"', 'monospace'],
                print: ['Arial', 'Helvetica', 'sans-serif'],
            },
        },
    },
    plugins: [],
}
