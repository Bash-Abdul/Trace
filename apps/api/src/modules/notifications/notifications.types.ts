export interface Notification {
  id: string;
  project_id: string;
  project_title: string;
  milestone_id: string | null;
  milestone_title: string | null;
  action: string;
  details: Record<string, unknown>;
  created_at: Date;
  read_at: Date | null;
}
export interface Inbox {
  items: Notification[];
  unread_count: number;
  next_cursor: string | null;
}
