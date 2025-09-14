import { Migration } from "@mikro-orm/migrations";

export class Migration20240603000018 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      "alter table `albion_guild_members_entity` modify `registered` varchar(255) not null default false, modify `warned` varchar(255) not null default false;",
    );

    this.addSql(
      "alter table `albion_registrations_entity` modify `manual` varchar(255) not null default false;",
    );

    this.addSql(
      "alter table `ps2members_entity` modify `manual` varchar(255) not null default false;",
    );
  }

  async down(): Promise<void> {
    this.addSql(
      "alter table `albion_registrations_entity` modify `manual` varchar(255) not null default '0';",
    );

    this.addSql(
      "alter table `ps2members_entity` modify `manual` varchar(255) not null default '0';",
    );

    this.addSql(
      "alter table `albion_guild_members_entity` modify `registered` varchar(255) not null default '0', modify `warned` varchar(255) not null default '0';",
    );
  }
}
