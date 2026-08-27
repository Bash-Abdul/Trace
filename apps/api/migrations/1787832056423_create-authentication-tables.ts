import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  // Stores the normalized account email and its Argon2id password hash.
  pgm.createTable('users', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    email: {
      type: 'text',
      notNull: true,
      unique: true,
    },
    password_hash: {
      type: 'text',
      notNull: true,
    },
    email_verified_at: {
      type: 'timestamptz',
    },
    password_changed_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  // Stores login sessions. PostgreSQL receives only hashes, never raw tokens.
  pgm.createTable('auth_sessions', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    token_hash: {
      type: 'varchar(64)',
      notNull: true,
      unique: true,
      check: 'length(token_hash) = 64',
    },
    csrf_token_hash: {
      type: 'varchar(64)',
      notNull: true,
      check: 'length(csrf_token_hash) = 64',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    last_used_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    idle_expires_at: {
      type: 'timestamptz',
      notNull: true,
    },
    absolute_expires_at: {
      type: 'timestamptz',
      notNull: true,
    },
    revoked_at: {
      type: 'timestamptz',
    },
  });

  // A session's idle expiry cannot be later than its absolute expiry.
  pgm.addConstraint('auth_sessions', 'auth_sessions_expiry_order_check', {
    check: 'idle_expires_at <= absolute_expires_at',
  });

  // Used when listing or revoking a user's current sessions.
  pgm.createIndex('auth_sessions', 'user_id', {
    name: 'auth_sessions_active_user_index',
    where: 'revoked_at IS NULL',
  });

  // Stores single-use email-verification and password-reset token hashes.
  pgm.createTable('auth_action_tokens', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    purpose: {
      type: 'text',
      notNull: true,
      check: "purpose IN ('EMAIL_VERIFICATION', 'PASSWORD_RESET')",
    },
    token_hash: {
      type: 'varchar(64)',
      notNull: true,
      unique: true,
      check: 'length(token_hash) = 64',
    },
    expires_at: {
      type: 'timestamptz',
      notNull: true,
    },
    consumed_at: {
      type: 'timestamptz',
    },
    invalidated_at: {
      type: 'timestamptz',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  // A token is either successfully consumed or invalidated, never both.
  pgm.addConstraint('auth_action_tokens', 'auth_action_tokens_terminal_state_check', {
    check: 'NOT (consumed_at IS NOT NULL AND invalidated_at IS NOT NULL)',
  });

  // Prevents concurrent creation of multiple active tokens for one purpose.
  pgm.createIndex('auth_action_tokens', ['user_id', 'purpose'], {
    name: 'auth_action_tokens_active_user_purpose_unique',
    unique: true,
    where: 'consumed_at IS NULL AND invalidated_at IS NULL',
  });

  // Helps find expired active tokens for later cleanup.
  pgm.createIndex('auth_action_tokens', 'expires_at', {
    name: 'auth_action_tokens_active_expiry_index',
    where: 'consumed_at IS NULL AND invalidated_at IS NULL',
  });
}

export function down(pgm: MigrationBuilder): void {
  // Drop children before users because they contain foreign keys to users.
  pgm.dropTable('auth_action_tokens');
  pgm.dropTable('auth_sessions');
  pgm.dropTable('users');
}
