export class UserFacingError extends Error {
  override readonly name: string = "UserFacingError";
}

export const safeErrorMessage = (error: unknown): string =>
  error instanceof UserFacingError
    ? error.message
    : "Unexpected internal error. Please report the failing step.";
