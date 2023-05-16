import { Factory, Seeder } from 'typeorm-seeding';
import { Config } from '../entities/config.entity';
import { Connection } from 'typeorm';
import { AlbionConsts } from '../../albion/consts/albion.consts';

export default class CreateConfig implements Seeder {
  public async run(factory: Factory, connection: Connection): Promise<void> {
    await connection
      .createQueryBuilder()
      .insert()
      .into(Config)
      .values([
        { key : AlbionConsts.registrationChannelIdKey, value: '1039269295735181413' },
        { key : AlbionConsts.guildGameIdKey, value: 'btPZRoLvTUqLC7URnDRgSQ' },
        { key : AlbionConsts.initiateRoleIdKey, value: '1076193105868501112' },
      ])
      .execute();
  }
}
