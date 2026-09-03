export type TerminalProfile = 'GIMML_ONE' | 'GIMML_MINI';
export type TerminalLayout = 'ONE' | 'MINI';

export type TerminalCapability = {
  key: string;
  classification: 'core' | 'profile_default' | 'free_setting' | 'paid_add_on';
  scope: 'merchant' | 'device';
  risk: string;
  active: boolean;
  catalog_items: Array<{
    sku: string;
    display_name: string;
    unit_price_cents: number;
    billing_interval: 'one_time' | 'monthly' | 'annual';
    active: boolean;
  }>;
};

export type TerminalDevice = {
  id: string;
  merchant_id: string;
  serial_number: string;
  enrollment_state: string;
  config_revision: number;
  last_seen_at: string | null;
  terminal_settings?: {
    device_id: string;
    value_json: {
      default_cents?: number;
      preset_cents?: number[];
      increment_cents?: number;
      maximum_cents?: number;
      reset_seconds?: number;
    };
    revision: number;
    updated_at: string;
  } | null;
  device_status?: {
    device_id: string;
    health_json: Record<string, unknown>;
    latitude: number | null;
    longitude: number | null;
    accuracy_m: number | null;
    location_recorded_at: string | null;
    received_at: string;
  } | null;
  device_profiles: Array<{ profile_key: TerminalProfile; layout_key: TerminalLayout }>;
};

export type TerminalMerchant = {
  id: string;
  display_name: string;
  billing_status: string;
  devices: TerminalDevice[];
};

export type TerminalDashboardData = {
  capabilities: TerminalCapability[];
  merchants: TerminalMerchant[];
  plans: Array<{ key: TerminalProfile; display_name: string; description: string; active: boolean }>;
  entitlements: Array<{
    id: string;
    merchant_id: string;
    sku: string;
    capability_key: string;
    state: string;
    device_assignments: Array<{ device_id: string; revoked_at: string | null }>;
  }>;
  transactions: Array<{
    transaction_id: string;
    merchant_id: string;
    serial_number: string;
    amount_minor: number;
    currency: string;
    status: string;
    transaction_type: string | null;
    entry_method: string | null;
    card_type: string | null;
    last4: string | null;
    authorization_code: string | null;
    batch_id: string | null;
    closed_loop_program: string | null;
    occurred_at: string;
  }>;
};
