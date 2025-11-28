import { NextResponse } from 'next/server';

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
}

export const api = {
  success<T>(data: T, options: { status?: number; message?: string } = {}): NextResponse<ApiResponse<T>> {
    const { status = 200, message } = options;
    return NextResponse.json({
      success: true,
      message,
      data,
    }, { status });
  },
  error(message: string, status: number = 500): NextResponse<ApiResponse<null>> {
    return NextResponse.json({
      success: false,
      message,
      data: null,
    }, { status });
  },
};
