import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from './jwt-auth.guard.js';

function makeContext(request: { headers: Record<string, string>; user?: unknown }) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  it('allows a public route to continue anonymously when an optional token is invalid', async () => {
    const request = { headers: { authorization: 'Bearer expired-token' } };
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(true) } as unknown as Reflector;
    const jwtService = { verifyAsync: vi.fn().mockRejectedValue(new Error('expired')) } as unknown as JwtService;
    const guard = new JwtAuthGuard(jwtService, reflector);

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('continues a public route when an optional authorization header is malformed', async () => {
    const request = { headers: { authorization: 'Basic invalid' } };
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(true) } as unknown as Reflector;
    const verifyAsync = vi.fn();
    const jwtService = { verifyAsync } as unknown as JwtService;
    const guard = new JwtAuthGuard(jwtService, reflector);

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(verifyAsync).not.toHaveBeenCalled();
  });

  it('continues to reject an invalid token on a protected route', async () => {
    const request = { headers: { authorization: 'Bearer expired-token' } };
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(false) } as unknown as Reflector;
    const jwtService = { verifyAsync: vi.fn().mockRejectedValue(new Error('expired')) } as unknown as JwtService;
    const guard = new JwtAuthGuard(jwtService, reflector);

    await expect(guard.canActivate(makeContext(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
