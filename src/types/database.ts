/**
 * Strongly-typed Supabase PostgreSQL Database Schema definitions.
 * Mirrors `supabase/migrations/20261108000000_initial_household_finance_schema.sql`
 * and `supabase/migrations/20261109000000_add_transaction_payment_method.sql`.
 */

export type HouseholdRole = 'owner' | 'member';

export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export type TransactionType = 'income' | 'expense';

export type TransactionScope = 'personal' | 'household';

export type TransactionVisibility = 'private' | 'shared';

export type AccountType =
  | 'bank_account'
  | 'cash'
  | 'credit_card'
  | 'fixed_deposit'
  | 'mutual_fund'
  | 'stocks';

export type PaymentMethodType =
  | 'cash'
  | 'upi'
  | 'credit_card'
  | 'debit_card'
  | 'bank_transfer'
  | 'other';

export type ProfileRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  default_currency: string;
  created_at: string;
  updated_at: string;
};

export type HouseholdRow = {
  id: string;
  name: string;
  base_currency: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type HouseholdMemberRow = {
  id: string;
  household_id: string;
  user_id: string;
  role: HouseholdRole;
  joined_at: string;
  updated_at: string;
};

export type InvitationRow = {
  id: string;
  household_id: string;
  inviter_id: string;
  invitee_email: string | null;
  role: HouseholdRole;
  status: InvitationStatus;
  expires_at: string;
  accepted_by: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CreatedInvitationResult = {
  invitation_id: string;
  raw_token: string;
  expires_at: string;
};

export type AcceptInvitationStatusCode =
  | 'ACCEPTED'
  | 'INVALID_TOKEN'
  | 'EXPIRED'
  | 'NOT_PENDING'
  | 'EMAIL_MISMATCH'
  | 'EMAIL_UNVERIFIED'
  | 'ALREADY_MEMBER';

export type AcceptInvitationResult = {
  success: boolean;
  status_code: AcceptInvitationStatusCode;
  message: string;
  household_id: string | null;
};

export type CategoryRow = {
  id: string;
  household_id: string | null;
  name: string;
  type: TransactionType;
  icon: string | null;
  color_hex: string | null;
  is_system: boolean;
  is_archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AccountRow = {
  id: string;
  household_id: string;
  owner_id: string;
  name: string;
  type: AccountType;
  institution_name: string | null;
  currency: string;
  is_shared_with_household: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export type AccountBalanceRow = {
  id: string;
  account_id: string;
  recorded_by: string;
  balance: number;
  as_of_date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type TransactionRow = {
  id: string;
  household_id: string;
  created_by: string;
  category_id: string;
  account_id: string | null;
  payment_method: PaymentMethodType;
  type: TransactionType;
  scope: TransactionScope;
  visibility: TransactionVisibility;
  amount: number;
  currency: string;
  transaction_date: string;
  description: string | null;
  merchant: string | null;
  created_at: string;
  updated_at: string;
};

export type DashboardSummaryResult = {
  currency: string;
  my_personal_income: number;
  my_personal_expense: number;
  my_household_contribution_income: number;
  my_household_contribution_expense: number;
  my_total_income: number;
  my_total_expenditure: number;
  household_total_income: number;
  household_total_expense: number;
};

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '12';
  };
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: {
          id: string;
          full_name?: string | null;
          avatar_url?: string | null;
          default_currency?: string;
        };
        Update: {
          full_name?: string | null;
          avatar_url?: string | null;
          default_currency?: string;
        };
        Relationships: [];
      };
      households: {
        Row: HouseholdRow;
        Insert: {
          id?: string;
          name: string;
          base_currency?: string;
          created_by: string;
        };
        Update: {
          name?: string;
          base_currency?: string;
        };
        Relationships: [];
      };
      household_members: {
        Row: HouseholdMemberRow;
        Insert: {
          id?: string;
          household_id: string;
          user_id: string;
          role?: HouseholdRole;
        };
        Update: {
          role?: HouseholdRole;
        };
        Relationships: [];
      };
      invitations: {
        Row: InvitationRow;
        Insert: {
          id?: string;
          household_id: string;
          inviter_id: string;
          invitee_email?: string | null;
          role?: HouseholdRole;
          status?: InvitationStatus;
          expires_at?: string;
        };
        Update: {
          status?: InvitationStatus;
        };
        Relationships: [];
      };
      categories: {
        Row: CategoryRow;
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          type: TransactionType;
          icon?: string | null;
          color_hex?: string | null;
          is_system?: boolean;
          is_archived?: boolean;
          created_by: string;
        };
        Update: {
          name?: string;
          icon?: string | null;
          color_hex?: string | null;
          is_archived?: boolean;
        };
        Relationships: [];
      };
      accounts: {
        Row: AccountRow;
        Insert: {
          id?: string;
          household_id: string;
          owner_id: string;
          name: string;
          type: AccountType;
          institution_name?: string | null;
          currency?: string;
          is_shared_with_household?: boolean;
          is_archived?: boolean;
        };
        Update: {
          name?: string;
          type?: AccountType;
          institution_name?: string | null;
          currency?: string;
          is_shared_with_household?: boolean;
          is_archived?: boolean;
        };
        Relationships: [];
      };
      account_balances: {
        Row: AccountBalanceRow;
        Insert: {
          id?: string;
          account_id: string;
          recorded_by: string;
          balance: number;
          as_of_date?: string;
          notes?: string | null;
        };
        Update: {
          balance?: number;
          as_of_date?: string;
          notes?: string | null;
        };
        Relationships: [];
      };
      transactions: {
        Row: TransactionRow;
        Insert: {
          id?: string;
          household_id: string;
          created_by: string;
          category_id: string;
          account_id?: string | null;
          payment_method?: PaymentMethodType;
          type: TransactionType;
          scope: TransactionScope;
          visibility?: TransactionVisibility;
          amount: number;
          currency?: string;
          transaction_date?: string;
          description?: string | null;
          merchant?: string | null;
        };
        Update: {
          category_id?: string;
          account_id?: string | null;
          payment_method?: PaymentMethodType;
          type?: TransactionType;
          scope?: TransactionScope;
          visibility?: TransactionVisibility;
          amount?: number;
          currency?: string;
          transaction_date?: string;
          description?: string | null;
          merchant?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      create_household_with_owner: {
        Args: {
          _name: string;
          _base_currency?: string;
        };
        Returns: string;
      };
      transfer_household_ownership: {
        Args: {
          _household_id: string;
          _new_owner_user_id: string;
          _demote_self?: boolean;
        };
        Returns: undefined;
      };
      create_household_invitation: {
        Args: {
          _household_id: string;
          _invitee_email?: string | null;
          _role?: HouseholdRole;
          _expires_in_days?: number;
        };
        Returns: CreatedInvitationResult[];
      };
      revoke_household_invitation: {
        Args: {
          _invitation_id: string;
        };
        Returns: boolean;
      };
      accept_household_invitation: {
        Args: {
          _raw_token: string;
        };
        Returns: AcceptInvitationResult[];
      };
      set_category_archived: {
        Args: {
          _category_id: string;
          _is_archived?: boolean;
        };
        Returns: undefined;
      };
      get_dashboard_summary: {
        Args: {
          _household_id: string;
          _start_date: string;
          _end_date: string;
        };
        Returns: DashboardSummaryResult[];
      };
      is_household_member: {
        Args: {
          _household_id: string;
        };
        Returns: boolean;
      };
      is_household_owner: {
        Args: {
          _household_id: string;
        };
        Returns: boolean;
      };
      shares_household_with: {
        Args: {
          _target_user_id: string;
        };
        Returns: boolean;
      };
      can_view_account: {
        Args: {
          _account_id: string;
        };
        Returns: boolean;
      };
      is_account_owner: {
        Args: {
          _account_id: string;
        };
        Returns: boolean;
      };
      delete_my_account: {
        Args: Record<string, never>;
        Returns: boolean;
      };
    };
    Enums: {
      household_role: HouseholdRole;
      invitation_status: InvitationStatus;
      transaction_type: TransactionType;
      transaction_scope: TransactionScope;
      transaction_visibility: TransactionVisibility;
      account_type: AccountType;
      payment_method_type: PaymentMethodType;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
