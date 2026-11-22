import {
  ArgumentsHost,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

function mockHost(url = '/some/path', method = 'POST') {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ url, method }),
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('keeps the status and message of an HttpException', () => {
    const { host, status, json } = mockHost('/users/register');

    filter.catch(new ConflictException('Email taken'), host);

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      statusCode: 409,
      error: 'Conflict',
      message: 'Email taken',
      path: '/users/register',
      timestamp: expect.any(String),
    });
  });

  it('keeps validation messages as an array', () => {
    const { host, json } = mockHost();

    filter.catch(new BadRequestException(['email must be an email']), host);

    expect(json.mock.calls[0][0]).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
      message: ['email must be an email'],
    });
  });

  it('hides the details of unexpected errors behind a generic 500 and logs them', () => {
    const { host, status, json } = mockHost('/auth/login');
    const logSpy = jest.spyOn(Logger.prototype, 'error');

    filter.catch(
      new Error('ER_ACCESS_DENIED: password for root@localhost'),
      host,
    );

    expect(status).toHaveBeenCalledWith(500);
    const body = json.mock.calls[0][0];
    expect(body).toMatchObject({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Internal server error',
    });
    expect(JSON.stringify(body)).not.toContain('ER_ACCESS_DENIED');
    expect(logSpy).toHaveBeenCalled();
  });
});
