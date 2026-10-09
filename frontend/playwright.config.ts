import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests', use: { baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000', launchOptions: { executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] } }, workers: 1 });
