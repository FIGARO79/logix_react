import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    server: {
        host: '0.0.0.0', // Expose to network if needed
        proxy: {
            // API routes
            '/api': {
                target: 'http://localhost:8000',
                changeOrigin: true,
                secure: false,
            },
            // Auth routes
            '/login': 'http://localhost:8000',
            '/logout': 'http://localhost:8000',
            '/register': 'http://localhost:8000',
            '/set_password': 'http://localhost:8000',
            // Specific feature endpoints
            '/update': 'http://localhost:8000',
            '/admin': 'http://localhost:8000',
            '/clear_database': 'http://localhost:8000',
            '/export_all_log': 'http://localhost:8000',
            '/get_item_for_counting': 'http://localhost:8000',
            '/save_count': 'http://localhost:8000',
            '/export_counts': 'http://localhost:8000',
            '/health': 'http://localhost:8000',
        }
    }
})
