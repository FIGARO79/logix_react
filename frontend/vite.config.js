import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
    plugins: [
        react(),
        basicSsl(),
        VitePWA({
            registerType: 'prompt',
            injectRegister: 'auto',
            devOptions: {
                enabled: false // Deshabilitar SW en desarrollo para evitar el error Status 0
            },
            workbox: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
                cleanupOutdatedCaches: true,
                // Evitar que el SW intercepte las peticiones de Backend, Docs y Vite Dev Server
                navigateFallbackDenylist: [/^\/api/, /^\/static/, /^\/docs/, /^\/openapi.json/, /^\/@vite\/client/, /^\/node_modules/],
                runtimeCaching: [
                    {
                        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'google-fonts-cache',
                            expiration: {
                                maxEntries: 10,
                                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
                            },
                            cacheableResponse: {
                                statuses: [0, 200]
                            }
                        }
                    },
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
                        src: '/pwa-64x64.png',
                        sizes: '64x64',
                        type: 'image/png',
                        purpose: 'any'
                    },
                    {
                        src: '/pwa-192x192.png',
                        sizes: '192x192',
                        type: 'image/png',
                        purpose: 'any maskable'
                    },
                    {
                        src: '/pwa-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'any maskable'
                    },
                    {
                        src: '/maskable-icon-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'maskable'
                    }
                ]
            }
        })
    ],
    server: {
        host: '0.0.0.0',
        proxy: {
            '/api': {
                target: 'http://localhost:8000',
                changeOrigin: true,
                secure: false,
            },
            '/static': 'http://localhost:8000',
        }
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    'react-vendor': ['react', 'react-dom', 'react-router-dom'],
                    'ui-vendor': ['react-toastify', 'react-to-print'],
                    'scanner-vendor': ['html5-qrcode', 'qrcode', 'react-barcode-scanner'],
                    'http-vendor': ['axios']
                }
            }
        },
        chunkSizeWarningLimit: 600,
        minify: 'terser',
        terserOptions: {
            compress: {
                drop_console: true,
                drop_debugger: true
            }
        }
    }
})
