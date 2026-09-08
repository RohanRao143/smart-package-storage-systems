import { describe, expect, it, vi } from 'vitest';

import { errorHandler } from '../../src/http/controllers.js';

import { ApiError } from '../../src/errors.js';

describe('errorHandler', () => {
  it('returns ApiError status and structured payload', () => {
    const response = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    errorHandler(
      new ApiError(
        403,
        'INVALID_PICKUP_CODE',
        'Locker ID or pickup code is invalid.',
      ),
      {} as any,
      response as any,
      {} as any,
    );

    expect(response.status).toHaveBeenCalledWith(403);

    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'INVALID_PICKUP_CODE',
        message: 'Locker ID or pickup code is invalid.',
      },
    });
  });

  it('returns 500 for unexpected errors', () => {
    const response = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    errorHandler(
      new Error('database exploded'),
      {} as any,
      response as any,
      {} as any,
    );

    expect(response.status).toHaveBeenCalledWith(500);

    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'An unexpected server error occurred.',
      },
    });

    consoleSpy.mockRestore();
  });
});