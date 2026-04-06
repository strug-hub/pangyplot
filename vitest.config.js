import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    resolve: {
        alias: {
            '@graph': path.resolve('pangyplot/static/js/graph'),
            '@graph-data': path.resolve('pangyplot/static/js/graph/data'),
            '@model': path.resolve('pangyplot/static/js/graph/detail/model'),
        },
    },
    test: {
        include: ['tests/graph/**/*.test.js'],
    },
});
