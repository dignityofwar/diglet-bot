import { Factory, Seeder } from 'typeorm-seeding';
import { Config } from '../entities/config.entity';
import { Connection } from 'typeorm';

export default class CreateConfig implements Seeder {
  public async run(factory: Factory, connection: Connection): Promise<void> {
    await connection
      .createQueryBuilder()
      .insert()
      .into(Config)
      .values([])
      .execute();
  }
}
