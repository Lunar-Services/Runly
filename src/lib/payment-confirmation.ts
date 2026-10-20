export type PaymentConfirmation =
  | {
      status: "complete";
      plan: string;
      interval: string | null;
      intervalCount: number;
      amount: number | null;
      currency: string;
      email: string | null;
    }
  | { status: "pending" | "expired" };
