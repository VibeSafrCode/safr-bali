export type OrderSummary = {
  id: number;
  service: string;
  status: string;
  payment_status: string;
  amount_usd?: number | null;
  created_at?: string;
};

export type Dashboard = {
  telegram_id: number;
  first_name?: string;
  username?: string;
  balance: number;
  referral_count: number;
  referral_link?: string | null;
  orders: OrderSummary[];
};

export type AuthStatus = {
  authenticated: boolean;
  login_configured?: boolean;
  telegram_id?: number;
  first_name?: string;
  username?: string;
};

export type RouteContext = {
  country?: string;
  city?: string;
  section?: string;
  service?: string;
};

export type ChatMessage = {
  id: number;
  author_type: "client" | "staff";
  body: string;
  created_at: string;
};

export type Chat = {
  id: number | null;
  status: string;
  route_context?: RouteContext;
  messages: ChatMessage[];
};
