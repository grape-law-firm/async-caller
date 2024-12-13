export enum TimeUnit {
  Milliseconds = 1,
  Seconds = 1000,
  Minutes = 60000,
  Hours = 3600000,
  Days = 86400000,
}

export interface RetryOptions {
  /**
   * The maximum number of retries. Default is 3.
   */
  maxRetries?: number;
  /**
   * The minimum delay between retries in milliseconds. Default is 1000.
   */
  minDelayInMs?: number;
  /**
   * The maximum delay between retries in milliseconds. Default is 10000
   */
  maxDelayInMs?: number;
  /**
   * The factor by which the delay should be increased after each retry. Default is 2.
   */
  backoffFactor?: number;
}

export interface TokenBucketOptions {
  capacity: number;
  fillPerWindow: number;
  windowInMs: number;
  initialTokens?: number;
}

/**
 * Should have two functions. One for identifying the result of the function, and one for identifying the error thrown by the function.
 *
 * Based on the determination of the function, the retry logic will be applied.
 *
 */
export interface ResultIdentifier {
  identifyResult: (result: any) => {
    isRateLimited: boolean;
    isClientSideError: boolean;
  };
  identifyError: (error: any) => {
    isRateLimited: boolean;
    isClientSideError: boolean;
  };
}
