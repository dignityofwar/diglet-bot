export interface RankMapInterface {
  [key: string]: {
    rank: string | null; // Matches the rank in the census API
    discordRoleId: string;
  };
}

const rolesToRankProduction = {
  '@PS2/Verified': {
    rank: null,
    discordRoleId: '200994684263333888',
  },
  '@PS2/Zealot': {
    rank: '6',
    discordRoleId: '200994684263333888',
  },
  '@PS2/SL': {
    rank: '4',
    discordRoleId: '200994684263333888',
  },
  '@PS2/PL': {
    rank: '3',
    discordRoleId: '200994684263333888',
  },
  '@PS2/Officer': {
    rank: '2',
    discordRoleId: '200994684263333888',
  },
  '@PS2/Leader': {
    rank: '1',
    discordRoleId: '199665445635096576',
  },
};

const rolesToRankDevelopment: RankMapInterface = {
  '@PS2/Verified': {
    rank: null,
    discordRoleId: '1139909190664601611',
  },
  '@PS2/Zealot': {
    rank: '6',
    discordRoleId: '1139909319886905496',
  },
  '@PS2/SL': {
    rank: '4',
    discordRoleId: '1142546129112805517',
  },
  '@PS2/PL': {
    rank: '3',
    discordRoleId: '1142546081922682900',
  },
  '@PS2/Officer': {
    rank: '2',
    discordRoleId: '1142546051606257755',
  },
  '@PS2/Leader': {
    rank: '1',
    discordRoleId: '1142546013685559337',
  },
};
const rankMap = process.env.ENVIRONMENT === 'production' ? rolesToRankProduction : rolesToRankDevelopment as RankMapInterface;
const pingRoles = [rankMap['@PS2/Officer'].discordRoleId, rankMap['@PS2/Leader'].discordRoleId];

export default () => ({
  albion: {
    guildGameId: 'btPZRoLvTUqLC7URnDRgSQ',
  },
  ps2: {
    censusServiceId: process.env.PS2_CENSUS_SERVICE_ID,
    outfitId: '37509488620604883',
    rankMap,
    pingRoles,
  },
  version: process.env.VERSION,
});
