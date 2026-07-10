import type { AuthRole, AuthUser } from "./types";
import { hasAnyAuthRole, hasAuthRole, isActiveUser } from "./service";

export class AuthRequiredError extends Error {
  constructor(message = "Authentication is required.") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

export class AuthForbiddenError extends Error {
  constructor(message = "The signed-in user is not allowed to access this resource.") {
    super(message);
    this.name = "AuthForbiddenError";
  }
}

export function requireActiveUser(user: AuthUser | undefined | null): AuthUser {
  if (!user || !isActiveUser(user)) {
    throw new AuthRequiredError();
  }

  return user;
}

export function requireAuthRole(user: AuthUser | undefined | null, role: AuthRole): AuthUser {
  const activeUser = requireActiveUser(user);

  if (!hasAuthRole(activeUser, role)) {
    throw new AuthForbiddenError(`The ${role} role is required.`);
  }

  return activeUser;
}

export function requireAnyAuthRole(
  user: AuthUser | undefined | null,
  roles: readonly AuthRole[],
): AuthUser {
  const activeUser = requireActiveUser(user);

  if (!hasAnyAuthRole(activeUser, roles)) {
    throw new AuthForbiddenError(`One of these roles is required: ${roles.join(", ")}.`);
  }

  return activeUser;
}
