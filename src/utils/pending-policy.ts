/** A retry submits a new billed job and must leave the previous request id recoverable. */
export function pendingIdsAfterRetry(existing: string[], oldId: string, newId: string): string[] {
  const kept = existing.filter((id) => id !== newId && id !== oldId);
  return [newId, oldId, ...kept];
}
