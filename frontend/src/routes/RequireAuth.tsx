import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getToken } from '../auth/tokenStore';
import { hasUsername, isValidToken } from '../auth/session';

interface Props { children: React.JSX.Element }

/**
 * Gate on /play.
 *
 * Two redirects, not one. A token with no username belongs to an account that
 * began registration and stopped; letting it reach /play means the socket opens
 * and WsAuthGuard immediately closes it with USERNAME_REQUIRED — a dead end
 * with no way forward. Sending them to step 2 resumes the signup instead.
 *
 * A missing token and a malformed one are treated the same way (login) —
 * `decodeUsername`/`hasUsername` alone can't tell a malformed token apart
 * from a valid token carrying an explicit `username: null`, since both
 * decode to "no username". `isValidToken` makes that distinction.
 *
 * The intended path rides along in location state so a deep link survives login.
 */
export function RequireAuth({ children }: Props): React.JSX.Element {
  const location = useLocation();
  const token = getToken();

  if (!token || !isValidToken(token)) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (!hasUsername(token)) return <Navigate to="/register/name" replace />;
  return children;
}
