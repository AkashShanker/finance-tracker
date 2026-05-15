export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  household_id: string | null;
  pay_frequency: "weekly" | "biweekly" | "monthly";
  next_pay_date: string | null;
  timezone: string;
  created_at: string;
}

export interface Household {
  id: string;
  name: string;
  invite_code: string;
  owner_id: string | null;
  created_at: string;
}

export interface Category {
  id: string;
  household_id: string;
  name: string;
  type: "income" | "expense";
  icon: string;
  created_at: string;
}

export interface Transaction {
  id: string;
  household_id: string;
  user_id: string;
  category_id: string | null;
  amount: number;
  type: "income" | "expense";
  description: string | null;
  date: string;
  created_at: string;
  category?: Category;
}

export interface Bill {
  id: string;
  household_id: string;
  name: string;
  amount: number;
  due_day: number | null;
  next_due_date: string | null;
  frequency: "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";
  schedule_type: "monthly" | "biweekly" | "weekly" | "quarterly" | "yearly" | "every_payday" | "every_other_payday" | "custom";
  custom_interval_days: number | null;
  paid_by: string | null;
  debt_id: string | null;
  category: string;
  is_autopay: boolean;
  is_active: boolean;
  created_at: string;
}

export interface Debt {
  id: string;
  household_id: string;
  name: string;
  current_balance: number;
  original_balance: number | null;
  interest_rate: number;
  minimum_payment: number;
  due_day: number | null;
  type: "credit_card" | "student_loan" | "auto_loan" | "mortgage" | "personal_loan" | "medical" | "other";
  is_active: boolean;
  created_at: string;
}

export interface Snapshot {
  id: string;
  household_id: string;
  date: string;
  label: string | null;
  notes: string | null;
  created_at: string;
  balances?: SnapshotBalance[];
}

export interface SnapshotBalance {
  id: string;
  snapshot_id: string;
  account_name: string;
  account_type: "asset" | "debt";
  balance: number;
  sort_order: number;
}

export interface HouseholdMember {
  id: string;
  household_id: string;
  profile_id: string | null;
  name: string;
  email: string | null;
  pay_frequency: "weekly" | "biweekly" | "monthly" | null;
  next_pay_date: string | null;
  is_active: boolean;
  created_at: string;
}

export interface TrackedAccount {
  id: string;
  household_id: string;
  name: string;
  account_type: "asset" | "debt";
  owner_member_id: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}
