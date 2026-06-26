export interface AuthResult {
  token: string;
  user: { id: string; username: string };
}

export interface AuthError {
  code: string;
  message: string;
}

export async function register(username: string, password: string): Promise<AuthResult> {
  const res = await fetch('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json() as unknown;
  if (!res.ok) {
    throw body as AuthError;
  }
  return body as AuthResult;
}

export async function login(username: string, password: string): Promise<AuthResult> {
  const res = await fetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json() as unknown;
  if (!res.ok) {
    throw body as AuthError;
  }
  return body as AuthResult;
}
