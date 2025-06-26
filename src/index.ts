import { TokenBucket } from "@grapelaw/token-bucket";
import type { RetryOptions, TokenBucketOptions, ResultIdentifier } from "./types.js";

const defaultTokenBucketOptions: TokenBucketOptions = {
  capacity: 10,
  fillPerWindow: 1,
  windowInMs: 100,
};

const defaultRetryOptions: RetryOptions = {
  maxRetries: 3,
  minDelayInMs: 1000,
  maxDelayInMs: 10000,
  backoffFactor: 2,
};

/**
 * A class for making asynchronous calls with retry, concurrency, and rate limiting capabilities.
 * Creates an instance of AsyncCaller.
 * @param options - The options for configuring the AsyncCaller.
 * @param options.tokenBucketOptions - The options for configuring the rate limits.
 * @param options.tokenBucketOptions.capacity - The maximum number of requests allowed in a window.
 * @param options.tokenBucketOptions.fillPerWindow - The number of requests to allow per window. This determines the rate at which requests are allowed.
 * @param options.tokenBucketOptions.windowInMs - The size of the window in milliseconds.
 * @param options.tokenBucketOptions.initialTokens - The initial number of allowed requests. If not provided, it defaults to the capacity. Setting it to a lower value can be useful for gradually ramping up the rate.
 * @param options.retryOptions - The options for configuring the retry behavior.
 * @param options.concurrency - The maximum number of concurrent tasks allowed.
 *
 * @example
 * // Create an AsyncCaller with a simple rate limit of 10 requests per second
 * const asyncCaller = new AsyncCaller({
 *   tokenBucketOptions: {
 *     capacity: 10,
 *     fillPerWindow: 10,
 *     windowInMs: 1000,
 *   },
 * });
 *
 * @example
 * // Create an AsyncCaller with a rate limit of 100 requests per minute, with a burst capacity of 20 requests
 * const asyncCaller = new AsyncCaller({
 *   tokenBucketOptions: {
 *     capacity: 20,
 *     fillPerWindow: 100,
 *     windowInMs: 60000,
 *   },
 * });
 */

export class AsyncCaller {
  private readonly _tokenBucket: TokenBucket;
  private readonly _retryOptions: RetryOptions;
  private readonly _concurrency: number;
  private runningTasks: number = 0;
  private readonly queue: Array<() => void>;
  private readonly verbose: boolean;
  private readonly resultIdentifier: ResultIdentifier;
  constructor (options?: {
    tokenBucketOptions?: TokenBucketOptions;
    retryOptions?: RetryOptions;
    concurrency?: number;
    customResultIdentifier?: ResultIdentifier;
  }, verbose: boolean = false) {
    this.verbose = verbose;
    this._tokenBucket = new TokenBucket(options?.tokenBucketOptions
      ? {
        ...options.tokenBucketOptions,
        windowInMs: options.tokenBucketOptions.windowInMs + 10,
      }
      : defaultTokenBucketOptions, this.verbose);
    this._retryOptions = options?.retryOptions ?? defaultRetryOptions;
    this._concurrency = options?.concurrency ?? 5;
    this.queue = [];
    this.resultIdentifier = options?.customResultIdentifier ?? this.defaultResponseIdentifier;
  }

  private readonly defaultResponseIdentifier: ResultIdentifier = {
    identifyResult: (response) => {
      return {
        isRateLimited: this.isRateLimitedError(response),
        isClientSideError: this.isClientSideError(response),
      };
    },
    identifyError: (error) => {
      return {
        isRateLimited: this.isRateLimitedError(error),
        isClientSideError: this.isClientSideError(error),
      };
    },
  };

  public async call<T>(fn: () => Promise<T>): Promise<T> {
    await new Promise<void>((resolve) => {
      this.queue.push(resolve);
      this.processTaskQueue();
    });
    return this.executeAndHandleErrors(fn);
  }

  private processTaskQueue () {
    while (this.runningTasks < this._concurrency && this.queue.length > 0) {
      this.runningTasks++;
      const resolve = this.queue.shift();
      if (resolve) {
        this.log(`Running task... Concurrency: (${this.runningTasks} / ${this._concurrency}) (Queue length: ${this.queue.length})`);
        resolve();
      }
    }
  }

  private async executeWithRetry<T> (fn: () => Promise<T>, tryCount: number = 1, lastResponse: any = undefined, lastError: any = undefined): Promise<T> {
    while (!await this._tokenBucket.consumeAsync());
    if (tryCount > this._retryOptions.maxRetries! + 1) {
      this.log("Max retries exceeded. Rejecting...");
      if (lastError)
        throw lastError;
      else
        return lastResponse;
    }
    return fn()
      .then(async (result) => {
        if (tryCount === this._retryOptions.maxRetries! + 1)
          return result;
        const fetchResult = result as Response;
        const identifiedErrors = this.resultIdentifier.identifyResult(fetchResult);
        if (identifiedErrors.isRateLimited) {
          const delay = this.calculateRetryDelay(tryCount, fetchResult.headers);
          // eslint-disable-next-line promise/param-names
          await new Promise<void>((innerResolve) => setTimeout(() => { innerResolve(); }, delay));
          return this.executeWithRetry(fn, tryCount + 1, fetchResult, lastError);
        } else
          return result;
      })
      .catch(async (err) => {
        if (tryCount === this._retryOptions.maxRetries! + 1) {
          this.log("Max retries exceeded. Rejecting...");
          throw err;
        }
        const identifiedErrors = this.resultIdentifier.identifyError(err);
        if (identifiedErrors.isClientSideError && !identifiedErrors.isRateLimited)
          throw err;
        // At this point, it is either a rate limit error, or an Unkown error. Either way, we retry with delay.
        const delay = this.calculateRetryDelay(tryCount, err.headers ?? err.response?.headers);
        // eslint-disable-next-line promise/param-names
        await new Promise<void>((innerResolve) => setTimeout(() => { innerResolve(); }, delay));
        return this.executeWithRetry(fn, tryCount + 1, lastResponse, err);
      });
  };

  private async executeAndHandleErrors<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return this.executeWithRetry(fn, 1, undefined);
    } finally {
      this.runningTasks--;
      this.processTaskQueue();
    }
  }

  private isClientSideError (errOrResponse: any): boolean {
    const possibleProperties = this.extractStatusCodeProperties(errOrResponse);
    for (const property of possibleProperties) {
      if (property >= 400 && property < 500) {
        this.log(`Client side error detected. Status code: ${property}`);
        this.log(JSON.stringify(errOrResponse));
        return true;
      }
    }
    return false;
  }

  private isRateLimitedError (errOrResponse: any): boolean {
    const possibleProperties = this.extractStatusCodeProperties(errOrResponse);
    this.log(`Possible properties: ${possibleProperties.join(", ")}`);
    for (const property of possibleProperties) {
      if (property === 429) {
        this.log("Too many requests detected, you might want to adjust your token bucket options.");
        return true;
      }
    }
    return false;
  }

  private extractStatusCodeProperties (err: any): number[] {
    const statusCodes = [
      err?.status,
      err?.response?.status,
      err?.statuscode,
      err?.response?.statuscode,
      err?.code,
    ];

    return statusCodes.map((status) => {
      if (typeof status === "number" && !Number.isNaN(status))
        return status;
      else if (typeof status === "string" && !Number.isNaN(Number.parseInt(status)))
        return Number.parseInt(status);
      else
        return undefined;
    }).filter(Boolean) as number[];
  }

  private calculateRetryDelay (completedTryCount: number, headers: any): number {
    if (headers) {
      let retryAfterHeader;
      if (typeof headers.get === "function")
        retryAfterHeader = headers.get("Retry-After");
      else
        retryAfterHeader = headers["Retry-After"];

      if (retryAfterHeader) {
        const delay = Number.parseInt(retryAfterHeader) * 1000;
        if (!Number.isNaN(delay)) {
          this._tokenBucket.forceWaitUntilMilisecondsPassed(delay);
          return delay;
        } else if (Date.parse(retryAfterHeader) > 0) {
          const now = new Date().getTime();
          const retryAfter = new Date(retryAfterHeader).getTime();
          const delay = Math.max(retryAfter - now, 0);
          this._tokenBucket.forceWaitUntilMilisecondsPassed(delay);
          this.log(`Retry-After header found. Delay: ${delay}ms`);

          return delay;
        } else {
          // If the Retry-After header value cannot be parsed, fall back to the default back-off strategy
          return this.calculateDefaultDelay(completedTryCount);
        }
      } else
        return this.calculateDefaultDelay(completedTryCount);
    } else {
      // If no specific Retry-After header is found, use the default back-off strategy
      return this.calculateDefaultDelay(completedTryCount);
    }
  }

  private calculateDefaultDelay (completedTryCount: number): number {
    // Exponential back-off strategy based on the RetryOptions
    const delay = Math.min(
      this._retryOptions.minDelayInMs! * (this._retryOptions.backoffFactor!) ** (completedTryCount - 1),
      this._retryOptions.maxDelayInMs!,
    );
    return delay;
  }

  private log (message: string) {
    if (this.verbose)
      console.log(`AsyncCaller: ${message}`);
  }
}

export * from "./types";
