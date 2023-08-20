import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import CensusAxiosFactory from '../factories/census.axios.factory';
import {
  CensusCharacterResponseInterface,
  CensusCharacterWithOutfitInterface,
} from '../interfaces/CensusCharacterResponseInterface';

@Injectable()
export class CensusApiService implements OnModuleInit {
  private readonly logger = new Logger(CensusApiService.name);
  private static readonly RETRY_ATTEMPTS = 3;
  private static readonly RETRY_DELAY_MS = 1000;

  constructor(private readonly censusClientFactory: CensusAxiosFactory) {}

  async onModuleInit() {
    // Check if our service ID is valid
    if (!process.env.PS2_CENSUS_SERVICE_ID) {
      throw new Error('PS2_CENSUS_SERVICE_ID is not defined.');
    }

    // Check if our service key is valid by doing a request to Census via Axios
    this.logger.debug('Attempting to reach Census...');
    const response: CensusCharacterResponseInterface = await this.requestWithRetries('https://census.daybreakgames.com/s:dignityofwar/get/ps2/character?name.first_lower=maelstrome26');

    if (response.error) {
      throw new Error(`PS2_CENSUS_SERVICE_ID env is not valid or Census is otherwise unavailable. Census returned: "${response.error}". Crashing the app.`);
    }
    this.logger.debug('Census responded!');
  }

  private async requestWithRetries<T>(url: string, tries = 0): Promise<T> {
    const request = this.censusClientFactory.createClient();

    if (tries === 3) {
      throw new Error('Failed to perform request to Census after multiple retries.');
    }

    try {
      const response = await request.get(url);
      return response.data;
    }
    catch (err) {
      this.logger.warn(`Request failed (attempt ${tries + 1}/${CensusApiService.RETRY_ATTEMPTS}). Retrying in ${CensusApiService.RETRY_DELAY_MS} ms...`);
      await new Promise(resolve => setTimeout(resolve, CensusApiService.RETRY_DELAY_MS));
      return this.requestWithRetries(url, tries + 1);
    }
  }

  async getCharacter(characterName: string): Promise<CensusCharacterWithOutfitInterface> {
    const url = `character?name.first_lower=${characterName.toLowerCase()}&c:join=outfit_member^on:cwharacter_id^to:character_id^inject_at:outfit_info&c:join=outfit^on:outfit_id^to:outfit_id^inject_at:outfit_details`;
    const response: CensusCharacterResponseInterface = await this.requestWithRetries(url);

    if (response.returned === 0 || !response.character_list || response.character_list.length === 0) {
      throw new Error(`Character **${characterName}** does not exist.`);
    }

    return response.character_list[0];
  }

  async getCharacterById(characterId: string): Promise<CensusCharacterWithOutfitInterface | null> {
    const url = `character?character_id=${characterId}&c:join=outfit_member^on:character_id^to:character_id^inject_at:outfit_info&c:join=outfit^on:outfit_id^to:outfit_id^inject_at:outfit_details`;
    const response: CensusCharacterResponseInterface = await this.requestWithRetries(url);

    if (response.returned === 0 || !response.character_list || response.character_list.length === 0) {
      this.logger.error('Census responded with nothing', response);
      return null;
    }

    return response.character_list[0];
  }
}
