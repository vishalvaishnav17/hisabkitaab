import { renderGroupDetail } from './groups/group-detail';
import { renderGroupsList } from './groups/groups-list';

/**
 * Renders the Groups view:
 * - If groupId is provided, renders group detail (#/groups/:id)
 * - Otherwise, renders the groups list (#/groups)
 */
export function renderGroups(container: HTMLElement, groupId?: string): void {
  if (groupId) {
    renderGroupDetail(container, groupId);
  } else {
    renderGroupsList(container);
  }
}
