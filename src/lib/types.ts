export interface Category {
  id: string;
  label: string;
  tone: string;
}

export interface Quarter {
  id: string;
  defined: number;
  label: string;
  current?: boolean;
}

export interface Milestone {
  id: string;
  index: number;
  title: string;
  amount_cc: number;
  due: Date;
  status: MilestoneStatus;
}

export interface Proposal {
  id: string;
  title: string;
  applicant: string;
  champion: string;
  category: string;
  amount_cc: number;
  milestones: Milestone[];
  status: ProposalStatus;
  quarter: string;
  submitted_at: Date;
  pr_number: number;
  labels: string[];
}

export interface VotingProposal extends Proposal {
  committee_votes: {
    approve: number;
    decline: number;
    abstain: number;
  };
  reviews_due: Date;
}

export interface Payment {
  proposal_id: string;
  proposal_title: string;
  milestone_id: string;
  amount_cc: number;
  released_at: Date;
  tx: string;
  applicant: string;
}

export interface ActivityItem {
  id: number;
  kind: string;
  title: string;
  proposal_id: string;
  proposal_title: string;
  who: string;
  when: Date;
  amount_cc: number | null;
}

export interface AppData {
  CATEGORIES: Category[];
  QUARTERS: Quarter[];
  STATUSES: string[];
  CHAMPIONS: string[];
  proposals: Proposal[];
  payments: Payment[];
  votingQueue: VotingProposal[];
  activity: ActivityItem[];
}

export interface Period {
  from: Date | null;
  to: Date | null;
  label: string;
  preset: string;
}

export type ProposalStatus = 'submitted' | 'champion-review' | 'tech-review' | 'voting' | 'approved' | 'declined';
export type MilestoneStatus = 'planned' | 'in-progress' | 'in-review' | 'delivered' | 'at-risk';
