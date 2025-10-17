export class CensusRetriesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CensusRetriesError";
  }
}
