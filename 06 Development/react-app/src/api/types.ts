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
  locale?: "ru" | "en";
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
  csrf_token?: string;
};

export type VisaEvent = {
  id: number;
  type: string;
  title?: string | null;
  description?: string | null;
  created_at: string;
};

export type VisaCase = {
  id: number;
  country_code: string;
  visa_type: { code: string; name: string; version: number };
  custom_visa_name?: string | null;
  service_status: string;
  lifecycle_status: string;
  publication_status: "PUBLISHED";
  notifications_enabled: boolean;
  issued_on?: string | null;
  entry_deadline?: string | null;
  entered_on?: string | null;
  stay_end?: string | null;
  expected_stay_end?: string | null;
  extension_available?: boolean | null;
  extension_days?: number | null;
  extensions_used?: number;
  extension_window_start?: string | null;
  next_action_text?: string | null;
  next_action_due_at?: string | null;
  recommended_contact_at?: string | null;
  documents?: Array<{ id: number; type: string; name: string; expires_on?: string | null; access_url?: string }>;
  timeline?: VisaEvent[];
  current_process?: { type: string; external_status: string; updated_at: string } | null;
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
  route_code?: string;
  enabled?: boolean;
  manual_calculation_required?: boolean;
};

export type ExchangeOptions = {
  give: ExchangeCurrencyOption[];
  receive: ExchangeCurrencyOption[];
  supported_pairs: ExchangePair[];
  manual_pairs_supported: boolean;
};

export type ExchangeQuote = {
  id?: string;
  quote_id?: string;
  route_code?: string;
  mode?: "GIVE" | "RECEIVE";
  give_currency?: string;
  receive_currency?: string;
  give_amount?: string;
  receive_amount?: string;
  source_asset?: string;
  target_asset?: string;
  source_amount_display?: string;
  target_amount_display?: string;
  status: "PRELIMINARY";
  manual_confirmation_required: boolean;
  calculated_at?: string;
  expires_at: string;
  warning?: string;
};

export type ExchangeRequest = {
  id: string | number;
  quote_id: string;
  status: "AWAITING_OPERATOR" | string;
};
