import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    resolve: {
        alias: {
            '@simplify': path.resolve('pangyplot/static/js/simplify'),
        },
    },
    test: {
        include: ['tests/simplify/**/*.test.js'],
    },
});
