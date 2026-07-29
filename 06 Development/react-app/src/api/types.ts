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

export type ExchangeCurrencyOption = {
  code: string;
  label: string;
};

export type ExchangePair = {
  give_currency: string;
  receive_currency: string;
  amount_sides: Array<"give" | "receive">;
};

export type ExchangeOptions = {
  give: ExchangeCurrencyOption[];
  receive: ExchangeCurrencyOption[];
  supported_pairs: ExchangePair[];
  manual_pairs_supported: boolean;
};

export type ExchangeQuote = {
  id: string;
  give_currency: string;
  receive_currency: string;
  give_amount: string;
  receive_amount: string;
  status: "PRELIMINARY";
  manual_confirmation_required: boolean;
  expires_at: string;
};
