import { AuthForbiddenError, AuthRequiredError, requireAuthRole } from "./guards";
import type { AuthUser } from "./types";

export type ProtectedRouteDecision =
  | { allowed: true; status: 200; user: AuthUser }
  | { allowed: false; status: 401 | 403; message: string };

export function authorizeAdminSurface(
  user: AuthUser | undefined | null,
): ProtectedRouteDecision {
  try {
    return {
      allowed: true,
      status: 200,
      user: requireAuthRole(user, "admin"),
    };
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return {
        allowed: false,
        status: 401,
        message: "Authentication is required.",
      };
    }

    if (error instanceof AuthForbiddenError) {
      return {
        allowed: false,
        status: 403,
        message: "The admin role is required.",
      };
    }

    throw error;
  }
}
