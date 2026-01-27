import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react(), basicSsl()],
    server: {
        host: '0.0.0.0', // Expose to network if needed
        proxy: {
            // API routes
            '/api': {
                target: 'http://localhost:8000',
                changeOrigin: true,
                secure: false,
            },
            // Static files (Images, etc)
            '/static': 'http://localhost:8000',
        }
    }
})
