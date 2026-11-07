export type GroupKind = 'trip' | 'home' | 'couple' | 'other';

export interface GroupListItem {
  id: string;
  name: string;
  emoji: string | null;
  kind: GroupKind;
  simplify_debts: number;
  archived_at: string | null;
  created_at: string;
  member_count: number;
  my_net_paise: number;
  last_activity_at: string;
}

export interface GroupRow {
  id: string;
  name: string;
  emoji: string | null;
  kind: GroupKind;
  simplify_debts: number;
  archived_at: string | null;
  created_at: string;
  deleted_at: string | null;
}

export interface GroupMember {
  group_id: string;
  person_id: string;
  joined_at: string;
  left_at: string | null;
  name: string;
  upi_vpa: string | null;
  phone: string | null;
  is_me: number;
}

export interface SettlementPayment {
  from: string;
  to: string;
  amount_paise: number;
}

export interface GroupDetailResponse {
  group: GroupRow;
  members: GroupMember[];
  balances: Record<string, number>;
  settlements: SettlementPayment[];
  next_payer: string | null;
  my_net_paise: number;
}

export interface TimelineExpenseShare {
  person_id: string;
  person_name: string;
  amount_paise: number;
}

export interface TimelineExpenseItem {
  type: 'expense';
  id: string;
  group_id: string;
  description: string;
  category: string;
  amount_paise: number;
  amount_expr: string | null;
  paid_by: string;
  paid_by_name: string;
  split_type: 'equal' | 'exact';
  date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  shares: TimelineExpenseShare[];
}

export interface TimelineTransferItem {
  type: 'transfer';
  id: string;
  group_id: string;
  from_person: string;
  from_name: string;
  to_person: string;
  to_name: string;
  amount_paise: number;
  amount_expr: string | null;
  date: string;
  method: string | null;
  note: string | null;
  created_at: string;
}

export type TimelineItem = TimelineExpenseItem | TimelineTransferItem;

export interface TimelineResponse {
  items: TimelineItem[];
  next_cursor: string | null;
}

export interface PersonItem {
  id: string;
  name: string;
  upi_vpa: string | null;
  phone: string | null;
  is_me: number;
  created_at: string;
}

export interface CreateGroupPayload {
  name: string;
  emoji?: string | null;
  kind?: string;
  member_ids?: string[];
}

export interface UpdateGroupPayload {
  name?: string;
  emoji?: string | null;
  kind?: string;
  simplify_debts?: number | boolean;
}

export interface CreateGroupExpensePayload {
  description: string;
  amount_paise: number;
  amount_expr?: string | null;
  paid_by?: string;
  participant_ids?: string[];
  split?:
    | { type: 'equal'; personIds?: string[] }
    | { type: 'exact'; amounts: Record<string, number> };
  category?: string;
  date?: string;
  notes?: string | null;
}

export interface UpdateGroupExpensePayload {
  description?: string;
  amount_paise?: number;
  amount_expr?: string | null;
  paid_by?: string;
  participant_ids?: string[];
  split?:
    | { type: 'equal'; personIds?: string[] }
    | { type: 'exact'; amounts: Record<string, number> };
  category?: string;
  date?: string;
  notes?: string | null;
}

export interface CreateGroupTransferPayload {
  from_person: string;
  to_person: string;
  amount_paise: number;
  amount_expr?: string | null;
  method?: string | null;
  date?: string | null;
  note?: string | null;
}
