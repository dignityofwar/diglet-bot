import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import CensusAxiosFactory from "../factories/census.axios.factory";
import {
  CensusCharacterResponseInterface,
  CensusCharacterWithOutfitInterface,
} from "../interfaces/CensusCharacterResponseInterface";
import { ConfigService } from "@nestjs/config";
import {
  CensusOutfitInterface,
  CensusOutfitResponseInterface,
} from "../interfaces/CensusOutfitResponseInterface";
import { CensusNotFoundResponse } from "../interfaces/CensusNotFoundResponse";
import { CensusRetriesError } from "../interfaces/CensusRetriesError";
import { CensusServerError } from "../interfaces/CensusServerError";

@Injectable()
export class CensusApiService implements OnModuleInit {
  private readonly logger = new Logger(CensusApiService.name);
  private static readonly RETRY_ATTEMPTS = 10;
  private static readonly RETRY_DELAY_MS = 3000;

  constructor(
    private readonly censusClientFactory: CensusAxiosFactory,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(character = "Maelstrome26") {
    // Check if our service ID is valid
    if (!this.config.get("ps2.censusServiceId")) {
      throw new Error("PS2_CENSUS_SERVICE_ID is not defined.");
    }

    // Check if our service key is valid by doing a request to Census via Axios
    this.logger.debug("Attempting to reach Census...");
    await this.getCharacter(character);
    this.logger.debug("Census responded!");
  }

  public async sendRequest<T>(url: string, tries = 0): Promise<T> {
    const request = this.censusClientFactory.createClient();
    tries = tries + 1;

    try {
      const response = await request.get(url);

      if (!response.data) {
        // noinspection ExceptionCaughtLocallyJS
        throw new Error("No data was received from Census!");
      }

      // If Census returns an "error" key, it means the request was unsuccessful.
      // Census does not use http error codes like any sane API, so we have to check for this manually.
      if (response.data.error) {
        // noinspection ExceptionCaughtLocallyJS
        throw new CensusServerError(
          `Census responded with an error: "${response.data.error}"`,
        );
      }

      if (response.data.errorMessage) {
        // noinspection ExceptionCaughtLocallyJS
        throw new CensusServerError(
          `Census responded with an error: "${response.data.errorMessage}"`,
        );
      }

      return response.data;
    } catch (err) {
      if (tries === CensusApiService.RETRY_ATTEMPTS) {
        const error = `Failed to perform request to Census after ${CensusApiService.RETRY_ATTEMPTS} retries. Final error: "${err.message}"`;
        this.logger.error(error);
        throw new CensusRetriesError(error);
      }

      this.logger.warn(
        `Request failed (attempt ${tries}/${CensusApiService.RETRY_ATTEMPTS}). Retrying in ${CensusApiService.RETRY_DELAY_MS} ms...`,
      );

      await new Promise((resolve) =>
        setTimeout(resolve, CensusApiService.RETRY_DELAY_MS),
      );
      return this.sendRequest(url, tries);
    }
  }

  async getCharacter(
    characterName: string,
  ): Promise<CensusCharacterWithOutfitInterface> {
    const url = `character?name.first_lower=${characterName.toLowerCase()}&c:join=outfit_member^inject_at:outfit_info`;

    const response: CensusCharacterResponseInterface =
      await this.sendRequest(url);

    if (
      response.returned === 0 ||
      !response.character_list ||
      response.character_list.length === 0
    ) {
      throw new CensusNotFoundResponse(
        `Character \`${characterName}\` does not exist. Please ensure you have spelt it correctly.`,
      );
    }

    return response.character_list[0];
  }

  async getCharacterById(
    characterId: string,
  ): Promise<CensusCharacterWithOutfitInterface | null> {
    const url = `character?character_id=${characterId}&c:join=outfit_member^inject_at:outfit_info`;

    let response: CensusCharacterResponseInterface;

    try {
      response = await this.sendRequest(url);
    } catch (err) {
      throw new CensusServerError(
        `Census Errored when fetching character with ID **${characterId}**. Err: ${err.message}`,
      );
    }

    if (
      response.returned === 0 ||
      !response.character_list ||
      response.character_list.length === 0
    ) {
      throw new CensusNotFoundResponse(
        `Character with ID **${characterId}** does not exist.`,
      );
    }

    return response.character_list[0];
  }

  async getOutfit(outfitId: string): Promise<CensusOutfitInterface | null> {
    const url = `outfit/${this.config.get("ps2.outfitId")}?c:resolve=rank`;

    let response: CensusOutfitResponseInterface;

    try {
      response = await this.sendRequest(url);
    } catch (err) {
      throw new CensusServerError(
        `Census Errored when fetching outfit with ID **${outfitId}**. Err: ${err.message}`,
      );
    }

    if (
      response.returned === 0 ||
      !response.outfit_list ||
      response.outfit_list.length === 0
    ) {
      throw new CensusNotFoundResponse(
        `Outfit with ID **${outfitId}** does not exist.`,
      );
    }

    return response.outfit_list[0];
  }
}
