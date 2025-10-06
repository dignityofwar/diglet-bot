import axios, { AxiosInstance } from "axios";
import { ConfigService } from "@nestjs/config";
import { Injectable } from "@nestjs/common";

@Injectable()
export default class CensusAxiosFactory {
  constructor(private readonly config: ConfigService) {}

  public createClient(): AxiosInstance {
    return axios.create({
      baseURL: `https://census.daybreakgames.com/s:${this.config.get("ps2.censusServiceId")}/get/ps2:v2/`,
      headers: {
        "Content-Type": "application/json",
      },
      timeout: this.config.get("ps2.censusTimeout"),
    });
  }
}
