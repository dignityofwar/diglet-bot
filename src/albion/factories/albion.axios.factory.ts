import axios, { AxiosInstance } from 'axios';
import { AlbionApiEndpoint } from '../interfaces/albion.api.interfaces';

export default class AlbionAxiosFactory {
  public createApiClient(): AxiosInstance {
    return axios.create({
      baseURL: AlbionApiEndpoint.ALBION_EUROPE,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}
