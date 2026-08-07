export interface PrivilegedUser {
  id: string;
  username: string;
  role: string;
  status: string;
}

export type SuperadminPromotionPlan =
  | { action: 'promote'; userId: string; username: string }
  | { action: 'noop'; userId: string; username: string };

export function planSoleAdminPromotion(
  activePrivilegedUsers: PrivilegedUser[],
  expectedUsername: string,
): SuperadminPromotionPlan;
