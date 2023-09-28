import axios from 'axios';
import AlbionAxiosFactory from './albion.axios.factory';

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
      baseURL: 'https://gameinfo.albiononline.com/api/gameinfo',
      headers: {
        'Content-Type': 'application/json',
      },
    };

    // Act
    albionAxiosFactory.createAlbionApiClient();

    // Assert
    expect(mockedAxios.create).toHaveBeenCalledWith(expectedConfig);
  });
});
