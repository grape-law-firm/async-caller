interface TokenBucketOptions {
    capacity: number;
    fillPerWindow: number;
    windowInMs: number;
    initialTokens?: number;
}

declare enum TimeUnit {
    Milliseconds = 1,
    Seconds = 1000,
    Minutes = 60000,
    Hours = 3600000,
    Days = 86400000
}
interface RetryOptions {
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
declare class AsyncCaller {
    private readonly _tokenBucket;
    private readonly _retryOptions;
    private readonly _concurrency;
    private runningTasks;
    private readonly queue;
    verbose: boolean;
    constructor(options?: {
        tokenBucketOptions?: TokenBucketOptions;
        retryOptions?: RetryOptions;
        concurrency?: number;
    }, verbose?: boolean);
    call<T>(fn: () => Promise<T>): Promise<T>;
    private processTaskQueue;
    private extractErrorMessageFromResponse;
    private executeWithRetry;
    private executeAndHandleErrors;
    isClientSideError(errOrResponse: any): boolean;
    isRateLimitedError(errOrResponse: any): boolean;
    extractStatusCodeProperties(err: any): number[];
    private calculateRetryDelay;
    private calculateDefaultDelay;
}

declare function removeMatterCode(caseName?: string): string;

export { AsyncCaller, type RetryOptions, TimeUnit, removeMatterCode };
