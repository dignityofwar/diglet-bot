import { Migration } from "@mikro-orm/migrations";

export class Migration20230813143054 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      "create table `ps2members_entity` (`id` int unsigned not null auto_increment primary key, `created_at` datetime not null, `updated_at` datetime not null, `discord_id` varchar(255) not null, `character_id` varchar(255) not null) default character set utf8mb4 engine = InnoDB;",
    );
    this.addSql(
      "alter table `ps2members_entity` add index `ps2members_entity_discord_id_index`(`discord_id`);",
    );
    this.addSql(
      "alter table `ps2members_entity` add unique `ps2members_entity_discord_id_unique`(`discord_id`);",
    );
    this.addSql(
      "alter table `ps2members_entity` add index `ps2members_entity_character_id_index`(`character_id`);",
    );
    this.addSql(
      "alter table `ps2members_entity` add unique `ps2members_entity_character_id_unique`(`character_id`);",
    );

    this.addSql(
      "create table `ps2verification_attempt_entity` (`id` int unsigned not null auto_increment primary key, `created_at` datetime not null, `updated_at` datetime not null, `character_id` varchar(255) not null, `guild_member` varchar(255) not null, `guild_message` varchar(255) not null) default character set utf8mb4 engine = InnoDB;",
    );
    this.addSql(
      "alter table `ps2verification_attempt_entity` add index `ps2verification_attempt_entity_character_id_index`(`character_id`);",
    );
    this.addSql(
      "alter table `ps2verification_attempt_entity` add unique `ps2verification_attempt_entity_character_id_unique`(`character_id`);",
    );
  }

  async down(): Promise<void> {
    this.addSql("drop table if exists `ps2members_entity`;");

    this.addSql("drop table if exists `ps2verification_attempt_entity`;");
  }
}
