import { Migration } from '@mikro-orm/migrations';

export class Migration20250404215544 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table \`joiner_leaver_entity\` (\`id\` int unsigned not null auto_increment primary key, \`created_at\` datetime not null, \`updated_at\` datetime not null, \`discord_id\` varchar(255) not null, \`discord_nickname\` varchar(255) not null, \`join_date\` datetime not null, \`leave_date\` datetime null, \`rejoined\` tinyint(1) not null default false, \`rejoin_count\` int not null default 0) default character set utf8mb4 engine = InnoDB;`);
    this.addSql(`alter table \`joiner_leaver_entity\` add index \`joiner_leaver_entity_discord_id_index\`(\`discord_id\`);`);
    this.addSql(`alter table \`joiner_leaver_entity\` add unique \`joiner_leaver_entity_discord_id_unique\`(\`discord_id\`);`);

    this.addSql(`alter table \`albion_guild_members_entity\` modify \`registered\` tinyint(1) not null default false, modify \`warned\` tinyint(1) not null default false;`);

    this.addSql(`alter table \`albion_registrations_entity\` modify \`manual\` tinyint(1) not null default false;`);

    this.addSql(`alter table \`ps2members_entity\` modify \`manual\` tinyint(1) not null default false;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists \`joiner_leaver_entity\`;`);

    this.addSql(`alter table \`albion_guild_members_entity\` modify \`registered\` varchar(255) not null default false, modify \`warned\` varchar(255) not null default false;`);

    this.addSql(`alter table \`albion_registrations_entity\` modify \`manual\` varchar(255) not null default false;`);

    this.addSql(`alter table \`ps2members_entity\` modify \`manual\` varchar(255) not null default false;`);
  }

}
