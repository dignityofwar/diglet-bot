import { Migration } from '@mikro-orm/migrations';

export class Migration20251220000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      'create table `albion_registration_queue_entity` (`id` int unsigned not null auto_increment primary key, `created_at` datetime not null, `updated_at` datetime not null, `guild_id` varchar(255) not null, `discord_guild_id` varchar(255) not null, `discord_channel_id` varchar(255) not null, `discord_id` varchar(255) not null, `character_name` varchar(255) not null, `server` varchar(255) not null, `status` varchar(255) not null default \'pending\', `attempt_count` int not null default 0, `expires_at` datetime not null, `last_error` varchar(2000) null default null) default character set utf8mb4 engine = InnoDB;',
    );
    this.addSql(
      'alter table `albion_registration_queue_entity` add index `albion_registration_queue_entity_guild_id_index`(`guild_id`);',
    );
    this.addSql(
      'alter table `albion_registration_queue_entity` add index `albion_registration_queue_entity_discord_guild_id_index`(`discord_guild_id`);',
    );
    this.addSql(
      'alter table `albion_registration_queue_entity` add index `albion_registration_queue_entity_discord_id_index`(`discord_id`);',
    );
    this.addSql(
      'alter table `albion_registration_queue_entity` add index `albion_registration_queue_entity_status_index`(`status`);',
    );
    this.addSql(
      'alter table `albion_registration_queue_entity` add index `albion_registration_queue_entity_expires_at_index`(`expires_at`);',
    );
    this.addSql(
      'alter table `albion_registration_queue_entity` add unique `unique_albion_registration_queue_guild_discord`(`guild_id`, `discord_id`);',
    );
  }

  override async down(): Promise<void> {
    this.addSql('drop table if exists `albion_registration_queue_entity`;');
  }
}
