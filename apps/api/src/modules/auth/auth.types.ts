import type { Request } from 'express';
import type { PoolClient } from 'pg';
import type { Database } from '../../config/db.js';

export interface Session {
  id: string;
  user_id: string;
  csrf_token_hash: string;
  created_at: Date;
  idle_expires_at: Date;
  absolute_expires_at: Date;
}

export type SessionIdentity = Pick<Session, 'id' | 'user_id'>;

export interface AuthenticatedContext<Client extends Database = Database> {
  userId: string;
  sessionId: string;
  db: Client;
}

export type HttpResult<Body> = { status: 200 | 201; body: Body } | { status: 204 };

export type AuthenticatedHandler<Params, Body, Result, Client extends Database = Database> = (
  request: Request<Params, Result, Body>,
  context: AuthenticatedContext<Client>,
) => Promise<HttpResult<Result>>;

export type MutationHandler<Params, Body, Result> = AuthenticatedHandler<
  Params,
  Body,
  Result,
  PoolClient
>;

export interface LoginResult {
  user: { id: string; email: string };
  sessionId: string;
  rawToken: string;
  csrfToken: string;
}
