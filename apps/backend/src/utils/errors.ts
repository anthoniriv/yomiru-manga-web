export class ScrapeError extends Error {
  constructor(
    message: string,
    public readonly url: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'ScrapeError';
  }
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}
