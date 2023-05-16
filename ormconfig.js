/* eslint-disable no-undef */
const path = require('path') // eslint-disable-line

const baseConfig = {
  type: 'mysql',
  database: process.env.DB_NAME,
  entities: [path.resolve(__dirname, 'src/**/*.entity{.ts,.js}')],
  migrations: [path.resolve(__dirname, 'src/database/migrations/**/*.ts')],
  logger: 'advanced-console',
  logging: ['warn', 'error'],
  cli: {
    migrationsDir: path.resolve('src/database/migrations'),
  },
  ssl: {
    rejectUnauthorized: true,
  },
};

module.exports = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  synchronize: true,
  ...baseConfig,
  seeds: ['src/database/seeds/**/*{.ts,.js}'],
  factories: ['src/database/factories/**/*{.ts,.js}'],
};
