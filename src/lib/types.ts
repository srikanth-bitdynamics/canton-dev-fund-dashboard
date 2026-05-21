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
  board_status?: string; // raw column name from Board #5 (e.g. "Payment under way")
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

// Milestone lifecycle (aligned to Board #5 columns):
//   planned             — not started
//   in-progress         — being worked on (includes Board #5 "Ready for evidence")
//   in-review           — "In Review for Payment" (Board #5 "Ready for Milestone Review")
//   approved            — "Ready for Payment" (Board #5 "Milestone Approved")
//   paying              — "Payment Ready to be Disbursed" (Board #5 "Payment under way")
//   delivered           — "Payment Disbursed" (Board #5 "Done")
//   at-risk             — overdue / contested
export type MilestoneStatus =
  | 'planned'
  | 'in-progress'
  | 'in-review'
  | 'approved'
  | 'paying'
  | 'delivered'
  | 'at-risk';
