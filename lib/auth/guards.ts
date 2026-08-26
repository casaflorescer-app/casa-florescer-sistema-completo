import type { AuthorizationContext, StaffRole } from "@/lib/auth/authorization";
import {
  canAccessAppPath,
  hasStaffRole,
  isClinicStaff,
  isPatientPortalUser,
} from "@/lib/auth/access";

export function requireSystemAdmin(auth: AuthorizationContext): boolean {
  return auth.isSystemAdmin;
}

export function requireMembership(auth: AuthorizationContext): boolean {
  return auth.memberships.length > 0;
}

export function requireRole(auth: AuthorizationContext, role: StaffRole): boolean {
  return hasStaffRole(auth, role);
}

export function requirePracticeAccess(
  auth: AuthorizationContext,
  practiceId: string,
): boolean {
  return auth.memberships.some((item) => item.practiceId === practiceId);
}

export function requirePatientPortal(auth: AuthorizationContext): boolean {
  return isPatientPortalUser(auth);
}

export function requireClinicStaff(auth: AuthorizationContext): boolean {
  return isClinicStaff(auth);
}

export type RouteAccessDecision = "wait" | "allow" | "deny";

export function resolveAppRouteAccess(
  authorization: AuthorizationContext | null,
  authorizationLoading: boolean,
  pathname: string,
): RouteAccessDecision {
  if (authorizationLoading || !authorization) return "wait";
  return canAccessAppPath(authorization, pathname) ? "allow" : "deny";
}
