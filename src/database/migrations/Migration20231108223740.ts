import { Migration } from "@mikro-orm/migrations";

export class Migration20231108223740 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      "create table `albion_guild_members_entity` (`id` int unsigned not null auto_increment primary key, `created_at` datetime not null, `updated_at` datetime not null, `character_id` varchar(255) not null, `character_name` varchar(255) not null, `registered` varchar(255) not null default false, `warned` varchar(255) not null default false) default character set utf8mb4 engine = InnoDB;",
    );
    this.addSql(
      "alter table `albion_guild_members_entity` add index `albion_guild_members_entity_character_id_index`(`character_id`);",
    );
    this.addSql(
      "alter table `albion_guild_members_entity` add unique `albion_guild_members_entity_character_id_unique`(`character_id`);",
    );
  }

  async down(): Promise<void> {
    this.addSql("drop table if exists `albion_guild_members_entity`;");
  }
}
