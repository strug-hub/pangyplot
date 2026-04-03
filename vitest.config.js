import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    resolve: {
        alias: {
            '@simplify': path.resolve('pangyplot/static/js/simplify'),
            '@simplify-data': path.resolve('pangyplot/static/js/simplify/data'),
            '@model': path.resolve('pangyplot/static/js/simplify/detail/model'),
        },
    },
    test: {
        include: ['tests/simplify/**/*.test.js'],
    },
});
