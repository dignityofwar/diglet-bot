// One-off backfill for the Albion rank date columns.
//
// Queries every row in albion_registrations_entity, then force-fetches each member from Discord
// to see which rank they actually hold right now. A cached lookup would stamp the wrong people,
// and a blanket SQL update cannot tell a Graduate from a Disciple at all.
//
//   pnpm build && pnpm backfill:albion-ranks [--dry-run]
//
// Only ever fills blanks, so it is safe to re-run. We have no record of when anyone was actually
// promoted, so everyone it stamps gets today.

import 'dotenv/config';
import { MikroORM } from '@mikro-orm/core';
import { Client, GatewayIntentBits, GuildMember } from 'discord.js';
import mikroOrmConfig from '../../mikro-orm.config';
import { AlbionRegistrationsEntity } from '../database/entities/albion.registrations.entity';
import { AlbionRoleMapInterface } from '../config/albion.app.config';
import AlbionAppConfig from '../config/albion.app.config';

const DRY_RUN = process.argv.includes('--dry-run');

interface Totals {
  registrations: number;
  graduates: number;
  adepts: number;
  alreadySet: number;
  notInServer: number;
  noRank: number;
}

const findRole = (roleMap: AlbionRoleMapInterface[], name: string): AlbionRoleMapInterface => {
  const role = roleMap.find((entry) => entry.name === name);

  if (!role) {
    throw new Error(`Could not find role "${name}" in the Albion role map`);
  }

  return role;
};

const login = async (token: string): Promise<Client> => {
  const client = new Client({
    // GuildMembers is what makes a forced member fetch possible
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });

  await new Promise<void>((resolve, reject) => {
    client.once('ready', () => resolve());
    client.once('error', reject);
    client.login(token).catch(reject);
  });

  return client;
};

async function main(): Promise<void> {
  const token = process.env.TOKEN;
  const discordGuildId = process.env.GUILD_ID_WITH_COMMANDS;

  if (!token || !discordGuildId) {
    throw new Error('TOKEN and GUILD_ID_WITH_COMMANDS must both be set');
  }

  const albionConfig = AlbionAppConfig();
  const roleMap: AlbionRoleMapInterface[] = albionConfig.roleMap;
  const graduateRole = findRole(roleMap, '@ALB/Graduate');
  const adeptRole = findRole(roleMap, '@ALB/Adept');

  const orm = await MikroORM.init(mikroOrmConfig);
  const em = orm.em.fork();
  const registrations = await em.find(AlbionRegistrationsEntity, { guildId: albionConfig.guildId });

  console.log(`Found ${registrations.length} Albion registration(s) to check.`);

  if (registrations.length === 0) {
    await orm.close();
    return;
  }

  const client = await login(token);
  const guild = await client.guilds.fetch(discordGuildId);
  const now = new Date();

  const totals: Totals = {
    registrations: registrations.length,
    graduates: 0,
    adepts: 0,
    alreadySet: 0,
    notInServer: 0,
    noRank: 0,
  };

  for (const [index, registration] of registrations.entries()) {
    if (index > 0 && index % 25 === 0) {
      console.log(`  ...${index}/${registrations.length}`);
    }

    let member: GuildMember;

    try {
      // force: true bypasses the cache entirely, same as the leaver scan does
      member = await guild.members.fetch({ user: registration.discordId, force: true });
    }
    catch {
      totals.notInServer++;
      console.warn(`  ⚠️  ${registration.characterName} (${registration.discordId}) is not in the server, skipping`);
      continue;
    }

    const isAdept = member.roles.cache.has(adeptRole.discordRoleId);
    const isGraduate = member.roles.cache.has(graduateRole.discordRoleId);

    if (!isAdept && !isGraduate) {
      totals.noRank++;
      continue;
    }

    let touched = false;

    if (isAdept && !registration.adeptSince) {
      registration.adeptSince = now;
      totals.adepts++;
      touched = true;
    }

    // An Adept was necessarily a Graduate first, so leaving graduateSince null would
    // misreport their history and block them from the Adept gate forever.
    if (!registration.graduateSince) {
      registration.graduateSince = now;
      totals.graduates++;
      touched = true;
    }

    if (touched) {
      console.log(`  ✅ ${registration.characterName} — ${isAdept ? 'Adept' : 'Graduate'}`);
    }
    else {
      totals.alreadySet++;
    }
  }

  if (DRY_RUN) {
    console.log('\n🧪 Dry run — nothing was written.');
  }
  else {
    await em.flush();
    console.log('\n✅ Written.');
  }

  console.log([
    `  Registrations checked:        ${totals.registrations}`,
    `  Graduate dates ${DRY_RUN ? 'to set' : 'set   '}:        ${totals.graduates}`,
    `  Adept dates ${DRY_RUN ? 'to set' : 'set   '}:           ${totals.adepts}`,
    `  Already had a date:           ${totals.alreadySet}`,
    `  Holds neither rank:           ${totals.noRank}`,
    `  No longer in the server:      ${totals.notInServer}`,
  ].join('\n'));

  await client.destroy();
  await orm.close();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });
