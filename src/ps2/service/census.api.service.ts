import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import CensusAxiosFactory from '../factories/census.axios.factory';
import {
  CensusCharacterResponseInterface,
  CensusCharacterWithOutfitInterface,
} from '../interfaces/CensusCharacterResponseInterface';

@Injectable()
export class CensusApiService implements OnModuleInit {
  constructor(private readonly censusClientFactory: CensusAxiosFactory) {}
  private readonly logger = new Logger(CensusApiService.name);

  async onModuleInit() {
    // Check if our service ID is valid
    if (!process.env.PS2_CENSUS_SERVICE_ID) {
      throw new Error('PS2_CENSUS_SERVICE_ID is not defined.');
    }

    // Check if our service key is valid by doing a request to Census via Axios
    const request = this.censusClientFactory.createClient();

    try {
      this.logger.debug('Attempting to reach Census...');
      const response = await request.get('');

      if (response.data.error) {
        throw new Error(`PS2_CENSUS_SERVICE_ID env is not valid or Census is otherwise unavailable. Census returned: "${response.data.error}"`);
      }
      this.logger.debug('Census responded!');

    }
    catch (err) {
      throw new Error(`Unable to verify Census Service ID. Err: ${err.message}`);
    }
  }

  async getCharacter(characterName: string): Promise<CensusCharacterWithOutfitInterface> {
    const request = this.censusClientFactory.createClient();
    const response: CensusCharacterResponseInterface = await request.get(`character?name.first_lower=${characterName.toLowerCase()}&c:join=outfit_member^on:character_id^to:character_id^inject_at:outfit_info&c:join=outfit^on:outfit_id^to:outfit_id^inject_at:outfit_details`);

    if (response.error) {
      throw new Error(`Census responded with error: ${response.error}`);

    }

    if (response.data.returned === 0) {
      throw new Error(`Character "${characterName}" does not exist. Please ensure you have supplied your exact name.`);
    }

    // It isn't possible to share a character name, so no length / duplication checks are required.

    return response.data.character_list[0];
  }
}
