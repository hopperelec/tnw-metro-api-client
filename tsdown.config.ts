import {defineConfig} from 'tsdown';

export default defineConfig({
    entry: 'src/index.ts',
    format: ['esm', 'cjs'],
    // The library must be compatible with both Node.js and browser environments.
    platform: 'neutral',
    target: 'es2020',
    dts: true,
});
