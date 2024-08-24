export class CensusServerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CensusServerError';
  }
}
