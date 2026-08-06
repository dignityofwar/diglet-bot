// The mention string plus what allowedMentions has to permit for it to actually notify anyone
export interface LeadershipPing {
  mention: string;
  roles: string[];
  users: string[];
}

export interface AlbionRoleMapInterface {
  name: string,
  discordRoleId: string;
  priority: number;
  keep: boolean
}

const rolesToRankProduction: AlbionRoleMapInterface[] = [
  {
    name: '@ALB/Archmage',
    discordRoleId: '1218115619732455474',
    priority: 1,
    keep: true,
  },
  {
    name: '@ALB/Magister',
    discordRoleId: '1218115569455464498',
    priority: 2,
    keep: false,
  },
  {
    name: '@ALB/EldritchMager',
    discordRoleId: '1218115480426905641',
    priority: 3,
    keep: false,
  },
  {
    name: '@ALB/Adept',
    discordRoleId: '1218115422029873153',
    priority: 4,
    keep: false,
  },
  {
    name: '@ALB/Graduate',
    discordRoleId: '1218115340009996339',
    priority: 5,
    keep: true,
  },
  {
    name: '@ALB/Disciple',
    discordRoleId: '1218115269419995166',
    priority: 6,
    keep: false,
  },
  {
    name: '@ALB/Registered',
    discordRoleId: '1224609941260603402',
    priority: 7,
    keep: true,
  },
];
const rolesToRankDevelopment: AlbionRoleMapInterface[] = [
  {
    name: '@ALB/Archmage',
    discordRoleId: '1232802066414571631',
    priority: 1,
    keep: true,
  },
  {
    name: '@ALB/Magister',
    discordRoleId: '1232802105564205126',
    priority: 2,
    keep: false,
  },
  {
    name: '@ALB/EldritchMage',
    discordRoleId: '1232802165861384305',
    priority: 3,
    keep: false,
  },
  {
    name: '@ALB/Adept',
    discordRoleId: '1232802244219637893',
    priority: 4,
    keep: false,
  },
  {
    name: '@ALB/Graduate',
    discordRoleId: '1232802285734727772',
    priority: 5,
    keep: true,
  },
  {
    name: '@ALB/Disciple',
    discordRoleId: '1232802355733336196',
    priority: 6,
    keep: false,
  },
  {
    name: '@ALB/Registered',
    discordRoleId: '1232778554320879811',
    priority: 7,
    keep: true,
  },
];
const isProduction = process.env.ENVIRONMENT === 'production';
const roleMap = isProduction ? rolesToRankProduction : rolesToRankDevelopment;
const findRole = (roleName: string) => roleMap.filter((role) => role.name === roleName)[0];
const pingLeaderRoles = [findRole('@ALB/Archmage').discordRoleId, findRole('@ALB/Magister').discordRoleId];

// Who the rank up ballot pings. Dev has no leadership role, and pinging dev Archmage would
// ping real people during testing, so it pings the dev user instead.
const leadershipPing = isProduction
  ? { mention: '<@&1421034165356331070>', roles: ['1421034165356331070'], users: [] }
  : {
    mention: `<@${process.env.DISCORD_DEVUSER_ID}>`,
    roles: [],
    users: [process.env.DISCORD_DEVUSER_ID],
  };

// Everyone who may vote on a rank up: Eldritch Mage and above, per the guild ranks wiki.
// Filtered on priority rather than name because production spells tier 3 "EldritchMager".
const ELECTOR_MAX_PRIORITY = 3;

// Roles that keep their ping roles without a registration, e.g. the alliance role. Alliance
// members use the pings but never register with DIG, so the sweep would otherwise strip them.
const pingRoleExemptRoles = (process.env.ALBION_PING_ROLE_EXEMPT_ROLES ?? '')
  .split(',')
  .map((roleId) => roleId.trim())
  .filter((roleId) => roleId.length > 0);

// There is one embed per ping category — content pings and guild pings — and more can be added
// without a deploy, so this is a list rather than a single ID.
const pingsMessageIds = (process.env.MESSAGE_ALBION_PINGS ?? '')
  .split(',')
  .map((messageId) => messageId.trim())
  .filter((messageId) => messageId.length > 0);

export default () => ({
  guildId: '0_zTfLfASD2Wtw6Tc-yckA',
  roleMap,
  pingLeaderRoles,
  leadershipPing,
  electorMaxPriority: ELECTOR_MAX_PRIORITY,
  // Ranks the bot grants itself once a vote passes. Adept is deliberately absent: it is
  // soft-leadership, so a human makes that call even after a successful vote.
  autoAssignRanks: ['@ALB/Graduate'],
  gameActivityName: 'Albion Online', // As Discord reports it in presence data
  // The pings embeds are the source of truth for which ALB/ roles are ping roles.
  // Rank roles share the prefix, so the name alone can't tell the two apart.
  pingsMessageIds,
  pingRoleExemptRoles,
  scanExcludedUsers: [], // Discord IDs
  guildLeaderRole: findRole('@ALB/Archmage'),
  guildOfficerRole: findRole('@ALB/Magister'),
});
