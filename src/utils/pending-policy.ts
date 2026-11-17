/** A retry submits a new billed job and must leave the previous request id recoverable. */
export function pendingIdsAfterRetry(existing: string[], oldId: string, newId: string): string[] {
  const kept = existing.filter((id) => id !== newId && id !== oldId);
  return [newId, oldId, ...kept];
}

/** Only the request currently shown in the overlay may clear busy state and progress. */
export function generationEventOwnsUi(eventRequestId: string, foregroundRequestId: string | null): boolean {
  return foregroundRequestId !== null && eventRequestId === foregroundRequestId;
}
