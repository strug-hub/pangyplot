import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    resolve: {
        alias: {
            '@graph': path.resolve('pangyplot/static/js/graph'),
            '@graph-data': path.resolve('pangyplot/static/js/graph/data'),
            '@model': path.resolve('pangyplot/static/js/graph/detail/model'),
            '@event-bus': path.resolve('pangyplot/static/js/event-bus.js'),
            '@app-state': path.resolve('pangyplot/static/js/app-state.js'),
            '@ui': path.resolve('pangyplot/static/js/ui'),
            '@utils': path.resolve('pangyplot/static/js/utils'),
        },
    },
    test: {
        include: ['tests/**/*.test.js'],
    },
});
