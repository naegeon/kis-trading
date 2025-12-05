import { NextResponse } from 'next/server';

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
}

export interface ApiResponseWithMeta<T, M = Record<string, unknown>> extends ApiResponse<T> {
  meta?: M;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const api = {
  /**
   * Returns a successful JSON response.
   * @param data - The response data
   * @param options - Optional status code and message
   */
  success<T>(data: T, options: { status?: number; message?: string } = {}): NextResponse<ApiResponse<T>> {
    const { status = 200, message } = options;
    return NextResponse.json({
      success: true,
      message,
      data,
    }, { status });
  },

  /**
   * Returns a successful JSON response with additional metadata.
   * Useful for responses with pagination, execution results, etc.
   * @param data - The response data
   * @param meta - Additional metadata
   * @param options - Optional status code and message
   */
  successWithMeta<T, M = Record<string, unknown>>(
    data: T,
    meta: M,
    options: { status?: number; message?: string } = {}
  ): NextResponse<ApiResponseWithMeta<T, M>> {
    const { status = 200, message } = options;
    return NextResponse.json({
      success: true,
      message,
      data,
      meta,
    }, { status });
  },

  /**
   * Returns a successful JSON response for resource creation (HTTP 201).
   * @param data - The created resource data
   * @param message - Optional success message
   */
  created<T>(data: T, message?: string): NextResponse<ApiResponse<T>> {
    return NextResponse.json({
      success: true,
      message,
      data,
    }, { status: 201 });
  },

  /**
   * Returns an error JSON response.
   * @param message - Error message
   * @param status - HTTP status code (default: 500)
   */
  error(message: string, status: number = 500): NextResponse<ApiResponse<null>> {
    return NextResponse.json({
      success: false,
      message,
      data: null,
    }, { status });
  },

  /**
   * Returns a validation error response with details.
   * @param message - Error message
   * @param details - Validation error details
   */
  validationError(message: string, details?: unknown): NextResponse<ApiResponse<null> & { details?: unknown }> {
    return NextResponse.json({
      success: false,
      message,
      data: null,
      details,
    }, { status: 400 });
  },

  /**
   * Returns a not found error response.
   * @param resource - Name of the resource that was not found
   */
  notFound(resource: string = 'Resource'): NextResponse<ApiResponse<null>> {
    return NextResponse.json({
      success: false,
      message: `${resource} not found`,
      data: null,
    }, { status: 404 });
  },

  /**
   * Returns an unauthorized error response.
   */
  unauthorized(): NextResponse<ApiResponse<null>> {
    return NextResponse.json({
      success: false,
      message: 'Unauthorized',
      data: null,
    }, { status: 401 });
  },

  /**
   * Returns a forbidden error response.
   * @param message - Optional custom message
   */
  forbidden(message: string = 'Forbidden'): NextResponse<ApiResponse<null>> {
    return NextResponse.json({
      success: false,
      message,
      data: null,
    }, { status: 403 });
  },
};
