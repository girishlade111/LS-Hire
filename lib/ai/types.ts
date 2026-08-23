export interface JobApplicationAnalysis {
  isJobApplication: boolean;
  candidateName: string | null;
  candidateEmail: string | null;
  positionApplied: string | null;
  replySubject: string;
  replyBody: string;
}
