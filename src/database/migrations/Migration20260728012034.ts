import { Migration } from '@mikro-orm/migrations';

// Hand-written rather than generated. The migration snapshot had fallen behind the entities, so
// `migration:create` believed albion_registration_queue_entity was a new table and emitted a
// `create table` for it, which would fail against the existing one and wedge the boot.
export class Migration20260728012034 extends Migration {

  override up(): void | Promise<void> {
    // DIG is EU-only, so the server column and the AlbionServer enum behind it are gone.
    this.addSql('alter table `albion_registration_queue_entity` drop index `unique_albion_registration_queue_guild_discord`;');
    this.addSql('alter table `albion_registration_queue_entity` drop column `server`;');
    this.addSql('alter table `albion_registration_queue_entity` modify `status` enum(\'pending\',\'succeeded\',\'failed\',\'expired\') not null default \'pending\';');
    this.addSql('alter table `albion_registration_queue_entity` add unique `unique_albion_registration_queue_guild_discord_status` (`guild_id`, `discord_id`, `status`);');

    // Abandoned guild member tracking. The entity was deleted long ago; only the table was left.
    this.addSql('drop table if exists `albion_guild_members_entity`;');
  }

  override down(): void | Promise<void> {
    this.addSql('alter table `albion_registration_queue_entity` drop index `unique_albion_registration_queue_guild_discord_status`;');
    this.addSql('alter table `albion_registration_queue_entity` modify `status` varchar(255) not null default \'pending\';');
    this.addSql('alter table `albion_registration_queue_entity` add `server` varchar(255) not null default \'Europe\';');
    this.addSql('alter table `albion_registration_queue_entity` add unique `unique_albion_registration_queue_guild_discord` (`guild_id`, `discord_id`);');

    // Recreated empty — the rows dropped above are not recoverable from here.
    this.addSql('create table `albion_guild_members_entity` (`id` int unsigned not null auto_increment primary key, `created_at` datetime not null, `updated_at` datetime not null, `character_id` varchar(255) not null, `character_name` varchar(255) not null, `registered` tinyint(1) not null default false, `warned` tinyint(1) not null default false) default character set utf8mb4 engine = InnoDB;');
    this.addSql('alter table `albion_guild_members_entity` add index `albion_guild_members_entity_character_id_index` (`character_id`);');
    this.addSql('alter table `albion_guild_members_entity` add unique `albion_guild_members_entity_character_id_unique` (`character_id`);');
  }

}
