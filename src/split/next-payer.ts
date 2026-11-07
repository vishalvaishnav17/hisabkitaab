export function suggestNextPayer(
  net: Map<string, number> | Record<string, number>,
  participantIds: string[],
  lastPaidAt: Record<string, string | undefined>
): string | null {
  if (!participantIds || participantIds.length === 0) {
    return null;
  }

  const map = net instanceof Map ? net : new Map(Object.entries(net));

  // Deduplicate participantIds and filter for negative balance
  const uniqueParticipants = Array.from(new Set(participantIds));
  const candidates = uniqueParticipants.filter((id) => (map.get(id) ?? 0) < 0);

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((idA, idB) => {
    const balA = map.get(idA) ?? 0;
    const balB = map.get(idB) ?? 0;

    // 1. Most negative balance first
    if (balA !== balB) {
      return balA - balB;
    }

    // 2. Oldest lastPaidAt (undefined counts as oldest)
    const dateA = lastPaidAt[idA];
    const dateB = lastPaidAt[idB];

    if (dateA === undefined && dateB !== undefined) return -1;
    if (dateA !== undefined && dateB === undefined) return 1;
    if (dateA !== undefined && dateB !== undefined) {
      const timeA = new Date(dateA).getTime();
      const timeB = new Date(dateB).getTime();
      if (timeA !== timeB) {
        return timeA - timeB;
      }
    }

    // 3. Lowest personId
    return idA < idB ? -1 : idA > idB ? 1 : 0;
  });

  return candidates[0];
}
