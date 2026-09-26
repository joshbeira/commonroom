export type User = { id: number; name: string; email: string; demo: number };
export type Session = {
  csrf: string;
  user: User | null;
  demo_enabled: boolean;
  recovery_enabled: boolean;
};
export type Member = { id: number; name: string };
export type Share = {
  expense_id: number;
  user_id: number;
  amount: number;
  state: "pending" | "submitted" | "confirmed";
};
export type Expense = {
  id: number;
  title: string;
  category: string;
  amount: number;
  note: string;
  incurred_on: string;
  creator_id: number;
  payer: string;
  status: string;
  shares: Share[];
  settled: boolean;
  receipt: number;
};
export type AuditEvent = {
  id: number;
  actor: string;
  action: string;
  created_at: string;
  hash: string;
  payload: string;
};
export type Workspace = {
  household: { id: number; name: string; owner_id: number };
  members: Member[];
  expenses: Expense[];
  balances: Record<number, number>;
  transfers: { from: number; to: number; amount: number }[];
  events: AuditEvent[];
  audit: { valid: boolean; count: number; head: string };
};
export const money = (pennies: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
    pennies / 100,
  );
export const initials = (name: string) =>
  name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");
export const formatDate = (date: string) =>
  new Date(date + "T12:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
