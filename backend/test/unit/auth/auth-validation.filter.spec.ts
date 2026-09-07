import { BadRequestException } from '@nestjs/common';
import { AuthValidationFilter } from '../../../src/auth/auth-validation.filter';

function makeHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
    }),
  };
  return { host: host as never, status, json };
}

describe('AuthValidationFilter', () => {
  const filter = new AuthValidationFilter();

  it('gives INVALID_EMAIL a sentence a person would write, not the bare code', () => {
    const { host, json } = makeHost();
    const exception = new BadRequestException({ properties: ['email'], message: 'Validation failed' });

    filter.catch(exception, host);

    const body = json.mock.calls[0][0] as { code: string; message: string };
    expect(body.code).toBe('INVALID_EMAIL');
    expect(body.message).not.toBe('INVALID_EMAIL');
    expect(body.message).toMatch(/[a-z]/); // not a SCREAMING_CASE code
    expect(body.message.length).toBeGreaterThan(10);
  });

  it('gives INVALID_PASSWORD a sentence a person would write', () => {
    const { host, json } = makeHost();
    const exception = new BadRequestException({ properties: ['password'], message: 'Validation failed' });

    filter.catch(exception, host);

    const body = json.mock.calls[0][0] as { code: string; message: string };
    expect(body.code).toBe('INVALID_PASSWORD');
    expect(body.message).not.toBe('INVALID_PASSWORD');
    expect(body.message).toMatch(/[a-z]/);
  });

  it('gives INVALID_USERNAME a sentence a person would write', () => {
    const { host, json } = makeHost();
    const exception = new BadRequestException({ properties: ['username'], message: 'Validation failed' });

    filter.catch(exception, host);

    const body = json.mock.calls[0][0] as { code: string; message: string };
    expect(body.code).toBe('INVALID_USERNAME');
    expect(body.message).not.toBe('INVALID_USERNAME');
    expect(body.message).toMatch(/[a-z]/);
  });

  it('passes an already-formatted body straight through unchanged', () => {
    const { host, json } = makeHost();
    const exception = new BadRequestException({ code: 'EMAIL_TAKEN', message: 'An account with that email already exists.' });

    filter.catch(exception, host);

    expect(json).toHaveBeenCalledWith({
      code: 'EMAIL_TAKEN',
      message: 'An account with that email already exists.',
    });
  });
});
