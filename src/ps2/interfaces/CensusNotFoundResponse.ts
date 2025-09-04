export class CensusNotFoundResponse extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CensusNotFoundResponse';
  }
}
