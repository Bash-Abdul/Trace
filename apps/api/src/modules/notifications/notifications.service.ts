import { withTransaction } from '../../config/db.js';
import type { PoolClient } from 'pg';
import type { Role } from '../projects/projects.types.js';
import { notFound } from '../../utils/app-error.js';
import * as repository from './notifications.repository.js';
import type { Inbox } from './notifications.types.js';
const roles: Role[] = ['LEAD_AUTHOR', 'AUTHOR', 'MAIN_REVIEWER'];
const pageSize = 50;
export async function inbox(userId: string, before?: string): Promise<Inbox> {
  return withTransaction(async (client) => {
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const rows = await repository.list(client, userId, roles, before, pageSize + 1);
    const items = rows.slice(0, pageSize);
    return {
      items,
      unread_count: await repository.unreadCount(client, userId, roles),
      next_cursor: rows.length > pageSize ? items[items.length - 1]!.id : null,
    };
  });
}
export async function mark(client: PoolClient, userId: string, id: string, read: boolean) {
  if (!(await repository.setRead(client, userId, roles, id, read)))
    throw notFound('Notification not found');
}
export async function markAll(client: PoolClient, userId: string) {
  await repository.readAll(client, userId, roles);
}
