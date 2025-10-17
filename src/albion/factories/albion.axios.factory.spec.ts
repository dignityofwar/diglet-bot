import axios from 'axios';
import AlbionAxiosFactory from './albion.axios.factory';
import { AlbionServer } from '../interfaces/albion.api.interfaces';

// Mocking the axios module
jest.mock('axios');

describe('AlbionAxiosFactory', () => {
  let albionAxiosFactory: AlbionAxiosFactory;
  let mockedAxios: jest.Mocked<typeof axios>;

  beforeEach(() => {
    albionAxiosFactory = new AlbionAxiosFactory();
    mockedAxios = axios as jest.Mocked<typeof axios>;
  });

  it('should create an AxiosInstance with the correct configuration', () => {
    // Arrange
    const expectedConfig = {
      baseURL: 'https://gameinfo-ams.albiononline.com/api/gameinfo',
      headers: {
        'Content-Type': 'application/json',
      },
    };

    albionAxiosFactory.createApiClient(AlbionServer.EUROPE);
    expect(mockedAxios.create).toHaveBeenCalledWith(expectedConfig);
  });

  it('should create an AxiosInstance with the correct configuration for Europe', () => {
    // Arrange
    const expectedConfig = {
      baseURL: 'https://gameinfo-ams.albiononline.com/api/gameinfo',
      headers: {
        'Content-Type': 'application/json',
      },
    };

    albionAxiosFactory.createApiClient(AlbionServer.EUROPE);
    expect(mockedAxios.create).toHaveBeenCalledWith(expectedConfig);
  });
});
