import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CleanupService } from './cleanup.service';

describe('CleanupService', () => {
  let service: CleanupService;

  const prisma = {
    refreshToken: { deleteMany: jest.fn() },
    passwordResetToken: { deleteMany: jest.fn() },
    invitation: { deleteMany: jest.fn() },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [CleanupService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(CleanupService);
  });

  it('deletes expired tokens and stale invitations in one transaction', async () => {
    prisma.$transaction.mockResolvedValue([{ count: 3 }, { count: 2 }, { count: 1 }]);

    const result = await service.cleanup();

    expect(result).toEqual({ refreshTokens: 3, passwordResetTokens: 2, invitations: 1 });
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [{ expiresAt: { lt: expect.any(Date) } }, { revokedAt: { lt: expect.any(Date) } }],
      },
    });
    expect(prisma.invitation.deleteMany).toHaveBeenCalledWith({
      where: { acceptedAt: null, expiresAt: { lt: expect.any(Date) } },
    });
  });
});
