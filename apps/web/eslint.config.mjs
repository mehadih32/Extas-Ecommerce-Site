import next from 'eslint-config-next';

const config = [...next, { ignores: ['.next/**', 'src/generated/**', 'next-env.d.ts'] }];

export default config;
