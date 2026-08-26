import { z } from "zod";

export const jobApplicationAnalysisSchema = z.object({
  isJobApplication: z.boolean(),
  candidateName: z.string().nullable(),
  candidateEmail: z.string().nullable(),
  positionApplied: z.string().nullable(),
  replySubject: z.string(),
  replyBody: z.string()
});

export interface JobApplicationAnalysis {
  isJobApplication: boolean;
  candidateName: string | null;
  candidateEmail: string | null;
  positionApplied: string | null;
  replySubject: string;
  replyBody: string;
}
