import 'dotenv/config'; // Needed as of mikro-orm v6
import { SqlHighlighter } from '@mikro-orm/sql-highlighter';
import { Logger } from '@nestjs/common';
import { defineConfig } from '@mikro-orm/mariadb';
import { ReflectMetadataProvider } from '@mikro-orm/decorators/legacy';

const logger = new Logger('MikroORM');
const port = Number(process.env.DB_PORT) || 3306;

const config = defineConfig({
  entities: ['./dist/src/database/entities'],
  entitiesTs: ['./src/database/entities'],
  // v7 no longer defaults to reflect-metadata; the entities use legacy decorators.
  metadataProvider: ReflectMetadataProvider,
  highlighter: new SqlHighlighter(),
  // clientUrl: dbURL,
  host: process.env.DB_HOST,
  port,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  dbName: process.env.DB_NAME,
  // extensions: [SeedManager, EntityGenerator],
  debug: process.env.DB_DEBUG === 'true',
  migrations: {
    path: './dist/src/database/migrations',
    pathTs: './src/database/migrations',
    transactional: false,
  },
  logger: logger.log.bind(logger),
  forceUtcTimezone: true,
  allowGlobalContext: true,
});

export default config;
