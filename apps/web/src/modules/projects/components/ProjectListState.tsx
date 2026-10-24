export function ProjectListState({ error, retry }: { error: string; retry: () => void }) {
  return error ? (
    <div className="soft-note" role="alert">
      {error}{' '}
      <button className="button secondary" onClick={retry}>
        Retry
      </button>
    </div>
  ) : (
    <p role="status">Loading your projects…</p>
  );
}
