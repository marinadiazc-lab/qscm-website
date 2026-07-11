import {
  AuthForbiddenError,
  AuthRequiredError,
  requireAnyAuthRole,
  requireAuthRole,
} from "./guards";
import type { AuthRole, AuthUser } from "./types";

export type ProtectedRouteDecision =
  | { allowed: true; status: 200; user: AuthUser }
  | { allowed: false; status: 401 | 403; message: string };

export function authorizeAdminSurface(
  user: AuthUser | undefined | null,
): ProtectedRouteDecision {
  return authorizeRoleSurface(user, ["admin"], "The admin role is required.");
}

export function authorizeAdminShellSurface(
  user: AuthUser | undefined | null,
): ProtectedRouteDecision {
  return authorizeRoleSurface(
    user,
    ["admin", "support", "editor", "moderator"],
    "The admin, support, editor, or moderator role is required.",
  );
}

export function authorizeModerationSurface(
  user: AuthUser | undefined | null,
): ProtectedRouteDecision {
  return authorizeRoleSurface(
    user,
    ["admin", "moderator"],
    "The admin or moderator role is required.",
  );
}

export function authorizeSubscriberAdminSurface(
  user: AuthUser | undefined | null,
): ProtectedRouteDecision {
  return authorizeRoleSurface(
    user,
    ["admin", "support", "editor"],
    "The admin, support, or editor role is required.",
  );
}

function authorizeRoleSurface(
  user: AuthUser | undefined | null,
  roles: readonly AuthRole[],
  forbiddenMessage: string,
): ProtectedRouteDecision {
  try {
    return {
      allowed: true,
      status: 200,
      user:
        roles.length === 1
          ? requireAuthRole(user, roles[0]!)
          : requireAnyAuthRole(user, roles),
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
        message: forbiddenMessage,
      };
    }

    throw error;
  }
}
