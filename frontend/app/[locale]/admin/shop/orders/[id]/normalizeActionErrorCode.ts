export function normalizeActionErrorCode(error: unknown): string {
  if (error instanceof TypeError) {
    return 'NETWORK_ERROR';
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'NETWORK_ERROR';
}
