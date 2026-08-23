export interface ParsedGmailMessage {
  id: string;
  threadId: string;
  subject: string;
  /**
   * Usually the FORWARDER's address for forwarded applications, not the real
   * applicant — the real address must be extracted from bodyText by the AI layer.
   */
  fromHeader: string;
  bodyText: string;
  hasAttachment: boolean;
}
