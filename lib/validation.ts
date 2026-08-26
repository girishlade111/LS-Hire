const EMAIL_PATTERN =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export type ParsedEmail = {
  address: string;
  name: string | null;
};

/**
 * Parses an RFC 5322 address that may be a bare address or a display-name
 * form ("Jane Doe <jane@example.com>") and validates the extracted address.
 *
 * The result is safe to embed in email headers — validation rejects control
 * characters, CR/LF, and other header-injection payloads.
 */
export function parseEmailAddress(input: string): ParsedEmail | null {
  const value = input.trim();
  if (!value || value.length > 320) {
    return null;
  }

  const angleMatch = value.match(/^(.*)<([^<>]+)>$/);
  let name: string | null = null;
  let candidate: string;

  if (angleMatch && angleMatch[1] !== undefined && angleMatch[2] !== undefined) {
    name = angleMatch[1].trim().replace(/^"|"$/g, "") || null;
    candidate = angleMatch[2].trim();
  } else {
    candidate = value;
  }

  if (!EMAIL_PATTERN.test(candidate)) {
    return null;
  }

  return { address: candidate.toLowerCase(), name };
}

/**
 * Strips CR/LF and other control characters from a string destined for an
 * RFC 822 header value (e.g. Subject), preventing header injection.
 */
export function sanitizeHeaderValue(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\r\n\x00-\x1f\x7f]+/g, " ").trim();
}

/**
 * Validates a user-configured Gmail label name used in settings. Rejects
 * characters that would break out of a quoted Gmail search term.
 */
export function isValidGmailLabelName(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 100 &&
    !/["\\\r\n]/.test(value) &&
    value.trim() === value
  );
}

/**
 * Renders a label name as a safely quoted Gmail search term so labels with
 * spaces work and embedded metacharacters cannot alter query semantics.
 */
export function gmailLabelQueryTerm(labelName: string): string {
  if (!isValidGmailLabelName(labelName)) {
    throw new Error(`Invalid Gmail label name: ${JSON.stringify(labelName)}`);
  }
  return `label:"${labelName}"`;
}
