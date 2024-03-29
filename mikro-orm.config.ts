import { SqlHighlighter } from '@mikro-orm/sql-highlighter';
import { Logger } from '@nestjs/common';
import { MariaDbOptions } from '@mikro-orm/mariadb/MariaDbMikroORM';

const logger = new Logger('MikroORM');

const dbURL = `mysql://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:3306/${process.env.DB_NAME}?sslaccept=strict`;
console.log(dbURL);

const config: MariaDbOptions = {
  entities: ['./dist/src/database/entities'],
  entitiesTs: ['./src/database/entities'],
  type: 'mariadb',
  highlighter: new SqlHighlighter(),
  // clientUrl: dbURL,
  host: process.env.DB_HOST,
  port: 3306,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  dbName: process.env.DB_NAME,
  // extensions: [SeedManager, EntityGenerator],
  debug: true,
  migrations: {
    path: './src/database/migrations',
    transactional: false,
  },
  logger: logger.log.bind(logger),
  forceUtcTimezone: true,
  allowGlobalContext: true,
};

export default config;

