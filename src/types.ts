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
  /**
   * Identify the result of the function, in case the function resolves to a value
   * @param result - The result of the function.
   * @returns An object with two properties: isRateLimited and isClientSideError.
   */
  identifyResult: (result: any) => {
    /**
     * If the result is considered rate limited, this should be true. In this case, the next retry (if any) will be delayed according to default logic, or the custom logic provided by the user.
     */
    isRateLimited: boolean;
  };
  /**
   * Identify the error thrown by the function.
   * @param error - The error thrown by the function.
   * @returns An object with two properties: isRateLimited and isClientSideError.
   */
  identifyError: (error: any) => {
    /**
     * If the error is considered rate limited, this should be true. In this case, the next retry (if any) will be delayed according to default logic, or the custom logic provided by the user. **Important**: This property takes precedence over `dontRetry`.
     */
    isRateLimited: boolean;
    /**
     * If the error shows that retrying is pointless (i.e client side error), this should be true. In this case (if this is `true` AND `isRateLimited` is `false`), retry will be stopped and the error will be thrown. **Important**: `isRateLimited` takes precedence over `dontRetry`.
     */
    dontRetry: boolean;
  };
}
