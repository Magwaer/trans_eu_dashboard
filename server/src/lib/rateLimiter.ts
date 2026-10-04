/** Token-bucket limiter matching Trans.eu published caps (5 RPS tokens, 15 RPS other). */
export class RateLimiter {
  private tokens: number;
  private last = Date.now();

  constructor(private readonly rps: number) {
    this.tokens = rps;
  }

  async take() {
    for (;;) {
      const now = Date.now();
      const elapsed = (now - this.last) / 1000;
      this.tokens = Math.min(this.rps, this.tokens + elapsed * this.rps);
      this.last = now;
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      await new Promise((r) => setTimeout(r, 80));
    }
  }
}

export const tokenLimiter = new RateLimiter(4);
export const apiLimiter = new RateLimiter(12);
