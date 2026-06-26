/** An application error carrying an HTTP status code and optional details. */
export class AppError extends Error {
  readonly statusCode: number;
  readonly details?: string[];

  constructor(message: string, statusCode = 400, details?: string[]) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class SafetyError extends AppError {
  constructor(message: string, details?: string[]) {
    super(message, 422, details);
    this.name = "SafetyError";
  }
}

/** Narrow an unknown thrown value to a readable message. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
