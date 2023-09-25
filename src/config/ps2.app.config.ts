export interface RankMapInterface {
  [key: string]: {
    ranks: string[] | null; // Matches the rank in the census API
    discordRoleId: string;
  };
}

const rolesToRankProduction = {
  '@PS2/Verified': {
    ranks: null,
    discordRoleId: '1140277291415515167',
  },
  '@PS2/DIGlet': {
    ranks: ['8'],
    discordRoleId: '912802327163990066',
  },
  '@PS2/Zealot': {
    ranks: ['6'],
    discordRoleId: '708714959068201031',
  },
  '@PS2/SL': {
    ranks: ['4', '5'],
    discordRoleId: '729027751901921280',
  },
  '@PS2/PL': {
    ranks: ['3'],
    discordRoleId: '729027479913889852',
  },
  '@PS2/Officer': {
    ranks: ['2'],
    discordRoleId: '200994684263333888',
  },
  '@PS2/Leader': {
    ranks: ['1'],
    discordRoleId: '199665445635096576',
  },
};

const rolesToRankDevelopment: RankMapInterface = {
  '@PS2/Verified': {
    ranks: null,
    discordRoleId: '1139909190664601611',
  },
  '@PS2/Zealot': {
    ranks: ['6'],
    discordRoleId: '1139909319886905496',
  },
  '@PS2/SL': {
    ranks: ['4', '5'],
    discordRoleId: '1142546129112805517',
  },
  '@PS2/PL': {
    ranks: ['3'],
    discordRoleId: '1142546081922682900',
  },
  '@PS2/Officer': {
    ranks: ['2'],
    discordRoleId: '1142546051606257755',
  },
  '@PS2/Leader': {
    ranks: ['1'],
    discordRoleId: '1142546013685559337',
  },
};
const rankMap = process.env.ENVIRONMENT === 'production' ? rolesToRankProduction : rolesToRankDevelopment as RankMapInterface;
const pingRoles = [rankMap['@PS2/Officer'].discordRoleId, rankMap['@PS2/Leader'].discordRoleId];

export default () => ({
  censusServiceId: process.env.PS2_CENSUS_SERVICE_ID,
  censusTimeout: 10000,
  outfitId: '37509488620604883',
  rankMap,
  pingRoles,
});
