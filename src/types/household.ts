import { HouseholdRole } from '@/types/database';

export type { HouseholdRole };

export interface HouseholdSummary {
  id: string;
  name: string;
  currencyCode: string;
  memberCount: number;
}

export interface FeatureHighlight {
  id: string;
  title: string;
  description: string;
  badge: string;
}
