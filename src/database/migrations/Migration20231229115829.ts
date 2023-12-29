import { Migration } from '@mikro-orm/migrations';

export class Migration20231229115829 extends Migration {

  async up(): Promise<void> {
    this.addSql('create table `activity_entity` (`id` int unsigned not null auto_increment primary key, `created_at` datetime not null, `updated_at` datetime not null, `discord_id` varchar(255) not null, `discord_nickname` varchar(255) not null, `last_activity` datetime not null) default character set utf8mb4 engine = InnoDB;');
    this.addSql('alter table `activity_entity` add index `activity_entity_discord_id_index`(`discord_id`);');
    this.addSql('alter table `activity_entity` add unique `activity_entity_discord_id_unique`(`discord_id`);');
  }

  async down(): Promise<void> {
    this.addSql('drop table if exists `activity_entity`;');
  }

}
