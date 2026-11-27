/** Throwing this marks the resource as failed with a message the user can act on. */
export class ExtractionError extends Error {
  constructor(message, code = 'EXTRACTION_FAILED') {
    super(message);
    this.code = code;
  }
}
