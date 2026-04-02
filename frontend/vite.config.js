import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        react(), 
        basicSsl(),
        VitePWA({
            registerType: 'autoUpdate',
            injectRegister: 'auto',
            devOptions: {
                enabled: false // Deshabilitar SW en desarrollo para evitar ruidos
            },
            workbox: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
                cleanupOutdatedCaches: true,
                // Evitar que el SW intercepte las peticiones de Backend
                navigateFallbackDenylist: [/^\/api/, /^\/static/],
                runtimeCaching: [
                    {
                        urlPattern: /\.(?:png|jpg|jpeg|svg|gif)$/,
                        handler: 'StaleWhileRevalidate',
                        options: {
                            cacheName: 'images-cache',
                            expiration: {
                                maxEntries: 50
                            }
                        }
                    }
                ]
            },
            manifest: {
                name: 'Logix - WMS',
                short_name: 'Logix',
                description: 'Sistema de Gestión de Almacén Offline-First',
                theme_color: '#285f94',
                background_color: '#ffffff',
                display: 'standalone',
                orientation: 'portrait',
                scope: '/',
                start_url: '/',
                id: '/',
                icons: [
                    {
                        src: '/icon.svg',
                        sizes: '192x192',
                        type: 'image/svg+xml',
                        purpose: 'any'
                    },
                    {
                        src: '/icon.svg',
                        sizes: '512x512',
                        type: 'image/svg+xml',
                        purpose: 'any maskable'
                    }
                ]
            }
        })
    ],
    server: {
        host: '0.0.0.0', // Expose to network if needed
        proxy: {
            // API routes
            '/api': {
                target: 'http://127.0.0.1:8000',
                changeOrigin: true,
                secure: false,
                cookieDomainRewrite: "localhost"
            },
            // Static files (Images, etc)
            '/static': 'http://127.0.0.1:8000',
        }
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    // Separar React y React Router
                    'react-vendor': ['react', 'react-dom', 'react-router-dom'],
                    // Separar bibliotecas de UI y utilidades
                    'ui-vendor': ['react-toastify', 'react-to-print'],
                    // Separar QR Code (librería grande)
                    'qrcode-vendor': ['html5-qrcode', 'qrcode'],
                    // Separar Axios (HTTP client)
                    'http-vendor': ['axios']
                }
            }
        },
        // Aumentar el límite de advertencia a 600kb para chunks individuales
        chunkSizeWarningLimit: 600,
        // Minificación mejorada
        minify: 'terser',
        terserOptions: {
            compress: {
                drop_console: true, // Eliminar console.log en producción
                drop_debugger: true
            }
        }
    }
})
