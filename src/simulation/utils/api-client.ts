import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * API Client
 *
 * Makes HTTP requests to the API using fetch, simulating a real client.
 * This client:
 * - Uses fetch API (like a real client would)
 * - Handles authentication headers
 * - Parses responses and errors
 * - Logs request/response details
 * - Retries on rate limit errors (429)
 */
@Injectable()
export class ApiClient {
  private readonly logger = new Logger(ApiClient.name);
  private readonly baseUrl: string;
  private readonly maxRetries = 3;
  private readonly initialRetryDelay = 2000; // 2 seconds

  constructor(private readonly configService: ConfigService) {
    const port = this.configService.get<number>('PORT', 3000);
    this.baseUrl = `http://localhost:${port}`;
  }

  /**
   * Make a POST request
   */
  async post<T = any>(
    endpoint: string,
    data: any,
    options: { token?: string } = {},
  ): Promise<{ status: number; data: T; headers: Headers }> {
    return this.request('POST', endpoint, data, options);
  }

  /**
   * Make a GET request
   */
  async get<T = any>(
    endpoint: string,
    options: { token?: string; query?: Record<string, any> } = {},
  ): Promise<{ status: number; data: T; headers: Headers }> {
    let url = endpoint;

    // Add query parameters if provided
    if (options.query) {
      const queryString = new URLSearchParams(
        Object.entries(options.query).reduce(
          (acc, [key, value]) => {
            if (value !== undefined && value !== null) {
              acc[key] = String(value);
            }
            return acc;
          },
          {} as Record<string, string>,
        ),
      ).toString();

      if (queryString) {
        url += `?${queryString}`;
      }
    }

    return this.request('GET', url, null, options);
  }

  /**
   * Make a PATCH request
   */
  async patch<T = any>(
    endpoint: string,
    data: any,
    options: { token?: string } = {},
  ): Promise<{ status: number; data: T; headers: Headers }> {
    return this.request('PATCH', endpoint, data, options);
  }

  /**
   * Make a DELETE request
   */
  async delete<T = any>(
    endpoint: string,
    options: { token?: string } = {},
  ): Promise<{ status: number; data: T; headers: Headers }> {
    return this.request('DELETE', endpoint, null, options);
  }

  /**
   * Generic request method with retry logic for rate limits
   */
  private async request<T = any>(
    method: string,
    endpoint: string,
    data: any = null,
    options: { token?: string } = {},
    retryCount: number = 0,
  ): Promise<{ status: number; data: T; headers: Headers }> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    // Add Authorization header if token is provided
    if (options.token) {
      headers['Authorization'] = `Bearer ${options.token}`;
    }

    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (data && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
      fetchOptions.body = JSON.stringify(data);
    }

    this.logger.debug(
      `${method} ${url}${retryCount > 0 ? ` (retry ${retryCount})` : ''}`,
    );
    if (data) {
      this.logger.debug(`Request body: ${JSON.stringify(data, null, 2)}`);
    }

    try {
      const response = await fetch(url, fetchOptions);
      const responseText = await response.text();

      let responseData: T;
      try {
        responseData = responseText ? JSON.parse(responseText) : null;
      } catch {
        responseData = responseText as any;
      }

      this.logger.debug(`Response status: ${response.status}`);
      this.logger.debug(
        `Response body: ${JSON.stringify(responseData, null, 2)}`,
      );

      // Handle rate limiting with retry
      if (response.status === 429 && retryCount < this.maxRetries) {
        const retryAfter = response.headers.get('retry-after');
        const delayMs = retryAfter
          ? parseInt(retryAfter) * 1000
          : this.initialRetryDelay * Math.pow(2, retryCount);

        this.logger.warn(
          `Rate limited (429). Retrying in ${delayMs}ms... (attempt ${retryCount + 1}/${this.maxRetries})`,
        );

        await this.sleep(delayMs);
        return this.request(method, endpoint, data, options, retryCount + 1);
      }

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}: ${JSON.stringify(responseData)}`,
        );
      }

      return {
        status: response.status,
        data: responseData,
        headers: response.headers,
      };
    } catch (error) {
      this.logger.error(`Request failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
