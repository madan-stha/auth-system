import { LessThan, Repository } from 'typeorm';
import { TokenCleanupService } from './token-cleanup.service';
import { RefreshToken } from './refresh-token.entity';

describe('TokenCleanupService', () => {
  let repo: jest.Mocked<Pick<Repository<RefreshToken>, 'delete'>>;
  let service: TokenCleanupService;

  beforeEach(() => {
    repo = { delete: jest.fn() } as never;
    service = new TokenCleanupService(
      repo as unknown as Repository<RefreshToken>,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('deletes tokens that expired before now and returns the count', async () => {
    const now = new Date('2026-11-25T12:00:00Z');
    repo.delete.mockResolvedValue({ affected: 4, raw: {} });

    await expect(service.deleteExpired(now)).resolves.toBe(4);
    expect(repo.delete).toHaveBeenCalledWith({ expiresAt: LessThan(now) });
  });

  it('returns 0 when the driver reports no count', async () => {
    repo.delete.mockResolvedValue({ raw: {} });
    await expect(service.deleteExpired()).resolves.toBe(0);
  });

  it('logs how many tokens the hourly job deleted', async () => {
    repo.delete.mockResolvedValue({ affected: 2, raw: {} });
    const log = jest
      .spyOn(service['logger'], 'log')
      .mockImplementation(() => undefined);

    await service.handleCron();

    expect(log).toHaveBeenCalledWith('Deleted 2 expired refresh token(s)');
  });

  it('stays quiet when nothing was deleted', async () => {
    repo.delete.mockResolvedValue({ affected: 0, raw: {} });
    const log = jest
      .spyOn(service['logger'], 'log')
      .mockImplementation(() => undefined);

    await service.handleCron();

    expect(log).not.toHaveBeenCalled();
  });

  it('logs failures instead of crashing the app', async () => {
    repo.delete.mockRejectedValue(new Error('db down'));
    const error = jest
      .spyOn(service['logger'], 'error')
      .mockImplementation(() => undefined);

    await expect(service.handleCron()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(
      'Refresh token cleanup failed',
      expect.stringContaining('db down'),
    );
  });
});
