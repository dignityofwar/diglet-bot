import { Migration } from "@mikro-orm/migrations";

export class Migration20230901000000 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      "create table `albion_registrations_entity` (`id` int unsigned not null auto_increment primary key, `created_at` datetime not null, `updated_at` datetime not null, `discord_id` varchar(255) not null, `character_id` varchar(255) not null, `character_name` varchar(255) not null, `manual` varchar(255) not null default false, `manual_created_by_discord_id` varchar(255) null default null, `manual_created_by_discord_name` varchar(255) null default null) default character set utf8mb4 engine = InnoDB;",
    );
    this.addSql(
      "alter table `albion_registrations_entity` add index `albion_registrations_entity_discord_id_index`(`discord_id`);",
    );
    this.addSql(
      "alter table `albion_registrations_entity` add index `albion_registrations_entity_character_id_index`(`character_id`);",
    );
  }

  async down(): Promise<void> {
    this.addSql("drop table if exists `albion_registrations_entity`;");
  }
}
