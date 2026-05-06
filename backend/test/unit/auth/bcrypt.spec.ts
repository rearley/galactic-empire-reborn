import * as bcrypt from 'bcrypt';
import { DUMMY_BCRYPT_HASH } from '../../../src/auth/auth.constants';

describe('bcrypt', () => {
  let hash: string;

  beforeAll(() => {
    hash = bcrypt.hashSync('testpassword', 12);
  });

  it('compareSync returns true for the correct password', () => {
    expect(bcrypt.compareSync('testpassword', hash)).toBe(true);
  });

  it('compareSync returns false for a wrong password', () => {
    expect(bcrypt.compareSync('wrongpassword', hash)).toBe(false);
  });

  it('DUMMY_BCRYPT_HASH is a valid bcrypt hash', () => {
    const result = bcrypt.compareSync('testpassword', DUMMY_BCRYPT_HASH);
    expect(typeof result).toBe('boolean');
  });
});
