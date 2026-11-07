import { fetchSettingsApi } from '../../api';
import { showToast } from '../../components/toast';
import { fetchGroupDetailApi, fetchGroupStatementApi } from './api';
import { renderFriendNudgeCard, renderGroupSummaryCard } from './nudge-card';
import { openPreviewSheet } from './preview-sheet';

export async function shareFriendNudge(groupId: string, personId: string): Promise<void> {
  try {
    showToast('Generating card...');
    const [settingsRes, statement] = await Promise.all([
      fetchSettingsApi().catch(() => null),
      fetchGroupStatementApi(groupId, personId),
    ]);

    if (!statement) {
      showToast('Could not load statement for friend', 'error');
      return;
    }

    const settings = settingsRes || { my_name: 'Me', my_upi_vpa: '' };
    const blob = await renderFriendNudgeCard(statement, settings);

    openPreviewSheet({
      blob,
      groupName: statement.group_name || statement.group?.name || 'group',
      title: `Share with ${statement.person?.name || 'Friend'}`,
    });
  } catch (err: any) {
    console.error('Failed to generate friend card:', err);
    showToast(err.message || 'Failed to generate card', 'error');
  }
}

export async function shareGroupSummaryNudge(groupId: string): Promise<void> {
  try {
    showToast('Generating summary card...');
    const groupDetail = await fetchGroupDetailApi(groupId);
    if (!groupDetail) {
      showToast('Could not load group details', 'error');
      return;
    }

    const blob = await renderGroupSummaryCard({
      group: groupDetail.group,
      members: groupDetail.members.map((m) => ({
        person_id: m.person_id,
        name: m.name,
        is_me: m.is_me,
      })),
      balances: groupDetail.balances,
      settlements: groupDetail.settlements,
    });

    openPreviewSheet({
      blob,
      groupName: groupDetail.group.name || 'group',
      title: `${groupDetail.group.name} Summary`,
    });
  } catch (err: any) {
    console.error('Failed to generate group summary card:', err);
    showToast(err.message || 'Failed to generate card', 'error');
  }
}
