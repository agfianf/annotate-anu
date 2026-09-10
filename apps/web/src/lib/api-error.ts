/** Backend puts every error reason in `message`; `detail` is never present. */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
  if (typeof message === 'string' && message.trim()) return message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
