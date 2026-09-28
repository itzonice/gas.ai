/** A parse failure whose message is safe to show the user. */
export class ParseFailure extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "ParseFailure";
  }
}
