export type MerchantRecord = {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'inactive' | 'archived';
  sales_rep_id: string | null;
  legal_business_name: string | null;
  dba_name: string | null;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state_region: string | null;
  postal_code: string | null;
  country_code: string;
  website: string | null;
  business_type: string | null;
  currency: string;
  timezone: string;
  billing_status: string;
  created_at: string;
};

export type SalesRepresentative = { id: string; name: string | null; email: string | null };

export type MerchantFormValues = {
  name: string;
  slug: string;
  legalBusinessName: string;
  dbaName: string;
  primaryContactName: string;
  primaryContactEmail: string;
  primaryContactPhone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  stateRegion: string;
  postalCode: string;
  countryCode: string;
  website: string;
  businessType: string;
  salesRepId: string;
  currency: string;
  timezone: string;
  billingStatus: string;
};

export const emptyMerchantForm: MerchantFormValues = {
  name: '', slug: '', legalBusinessName: '', dbaName: '', primaryContactName: '',
  primaryContactEmail: '', primaryContactPhone: '', addressLine1: '', addressLine2: '',
  city: '', stateRegion: '', postalCode: '', countryCode: 'US', website: '', businessType: '',
  salesRepId: '', currency: 'USD', timezone: 'America/New_York', billingStatus: 'trialing'
};

