export interface AlbionRoleMapInterface {
  name: string,
  discordRoleId: string;
  priority: number;
  keep: boolean
}

const rolesToRankProduction: AlbionRoleMapInterface[] = [
  {
    name: '@ALB/Guildmaster',
    discordRoleId: '1039565956885786784',
    priority: 1,
    keep: true,
  },
  {
    name: '@ALB/Master',
    discordRoleId: '1039566101593456694',
    priority: 2,
    keep: false,
  },
  {
    name: '@ALB/General',
    discordRoleId: '1039565571970310276',
    priority: 3,
    keep: false,
  },
  {
    name: '@ALB/Captain',
    discordRoleId: '1039565777650581575',
    priority: 4,
    keep: false,
  },
  {
    name: '@ALB/Squire',
    discordRoleId: '1039565554563960852',
    priority: 5,
    keep: true,
  },
  {
    name: '@ALB/Initiate',
    discordRoleId: '1076193105868501112',
    priority: 6,
    keep: false,
  },
];
const rolesToRankDevelopment: AlbionRoleMapInterface[] = [
  {
    name: '@ALB/Guildmaster',
    discordRoleId: '1158467537550454895',
    priority: 1,
    keep: true,
  },
  {
    name: '@ALB/Master',
    discordRoleId: '1158467574678429696',
    priority: 2,
    keep: false,
  },
  {
    name: '@ALB/General',
    discordRoleId: '1158467600687300699',
    priority: 3,
    keep: false,
  },
  {
    name: '@ALB/Captain',
    discordRoleId: '1158467651165761626',
    priority: 4,
    keep: false,
  },
  {
    name: '@ALB/Squire',
    discordRoleId: '1158467840496635914',
    priority: 5,
    keep: true,
  },
  {
    name: '@ALB/Initiate',
    discordRoleId: '1139909152701947944',
    priority: 6,
    keep: false,
  },
];
const roleMap = process.env.ENVIRONMENT === 'production' ? rolesToRankProduction : rolesToRankDevelopment as AlbionRoleMapInterface[];
const pingRoles = [roleMap['@ALB/Master'].discordRoleId, roleMap['@ALB/Guildmaster'].discordRoleId];

export default () => ({
  guildId: 'btPZRoLvTUqLC7URnDRgSQ',
  roleMap,
  pingRoles,
});
