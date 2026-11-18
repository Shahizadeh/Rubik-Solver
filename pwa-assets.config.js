import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Generates the PNG icons (favicon, apple-touch-icon, 192/512 and maskable)
// from public/icon.svg. Run with: npm run generate-icons
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#0f1115' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#0f1115' } },
  },
  images: ['public/icon.svg'],
});
