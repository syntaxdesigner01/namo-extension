// vite.config.js
// Tailwind CSS V4 with Vite

import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
    plugins: [
        tailwindcss(),
    ],
    build: {
        rollupOptions: {
            input: {
                background: 'src/background.ts',
                popup: 'src/popup.html',
                offscreen: 'src/offscreen.html',
                permission: 'src/permission.html',

            },
            output: {
                entryFileNames: '[name].js',
                chunkFileNames: '[name].js',
                assetFileNames: '[name].[ext]',
            },
        },
    },
})
