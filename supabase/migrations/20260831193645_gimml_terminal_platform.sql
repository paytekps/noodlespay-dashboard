begin;
create schema if not exists gimml_terminal;
create type gimml_terminal.entitlement_scope as enum ('merchant','device');
create type gimml_terminal.entitlement_state as enum ('active','trial','past_due','suspended','cancelled','expired');
create type gimml_terminal.command_state as enum ('queued','claimed','succeeded','failed','expired','cancelled');

create table gimml_terminal.merchants(id uuid primary key,display_name text not null,currency char(3) not null default 'USD',timezone text not null default 'America/New_York',billing_status text not null,created_at timestamptz not null default now());
create table gimml_terminal.devices(id uuid primary key,merchant_id uuid not null references gimml_terminal.merchants(id),serial_number text not null unique check(serial_number ~ '^[A-Za-z0-9._:-]{1,128}$'),public_key_der bytea,key_fingerprint text,enrollment_state text not null,config_revision bigint not null default 0 check(config_revision>=0),last_seen_at timestamptz,created_at timestamptz not null default now());
create table gimml_terminal.profiles(key text primary key check(key in ('GIMML_ONE','GIMML_MINI','CUSTOM')),display_name text not null,active boolean not null default true);
create table gimml_terminal.device_profiles(device_id uuid primary key references gimml_terminal.devices(id),profile_key text not null references gimml_terminal.profiles(key),layout_key text not null check(layout_key in ('ONE','MINI')),updated_at timestamptz not null default now());
create table gimml_terminal.capabilities(key text primary key,classification text not null check(classification in ('core','profile_default','free_setting','paid_add_on')),scope gimml_terminal.entitlement_scope not null,risk text not null,minimum_app_version integer not null default 1,active boolean not null default true);
create table gimml_terminal.catalog_items(sku text primary key,display_name text not null,capability_key text not null references gimml_terminal.capabilities(key),scope gimml_terminal.entitlement_scope not null,unit_price_cents bigint not null check(unit_price_cents>=0),currency char(3) not null default 'USD',billing_interval text not null check(billing_interval in ('one_time','monthly','annual')),active boolean not null default true);
create table gimml_terminal.merchant_entitlements(id uuid primary key,merchant_id uuid not null references gimml_terminal.merchants(id),sku text not null references gimml_terminal.catalog_items(sku),capability_key text not null references gimml_terminal.capabilities(key),state gimml_terminal.entitlement_state not null,quantity integer not null default 1 check(quantity>=0),starts_at timestamptz not null,expires_at timestamptz,source text not null,created_at timestamptz not null default now(),unique(merchant_id,sku,starts_at));
create table gimml_terminal.device_assignments(id uuid primary key,entitlement_id uuid not null references gimml_terminal.merchant_entitlements(id),device_id uuid not null references gimml_terminal.devices(id),assigned_at timestamptz not null default now(),revoked_at timestamptz,unique(entitlement_id,device_id,assigned_at));
create table gimml_terminal.merchant_settings(merchant_id uuid not null references gimml_terminal.merchants(id),key text not null,value_json jsonb not null,revision bigint not null check(revision>0),updated_at timestamptz not null default now(),primary key(merchant_id,key));
create table gimml_terminal.device_settings(device_id uuid not null references gimml_terminal.devices(id),key text not null,value_json jsonb not null,revision bigint not null check(revision>0),updated_at timestamptz not null default now(),primary key(device_id,key));
create table gimml_terminal.closed_loop_programs(id uuid primary key,merchant_id uuid not null references gimml_terminal.merchants(id),display_name text not null,bin_prefix text not null check(bin_prefix ~ '^[0-9]{6,8}$'),enabled boolean not null default true,unique(merchant_id,bin_prefix));
create table gimml_terminal.transactions(id text primary key,merchant_id uuid not null references gimml_terminal.merchants(id),device_id uuid not null references gimml_terminal.devices(id),amount_minor bigint not null check(amount_minor>=0),currency char(3) not null,status text not null,processor_reference text,last4 text check(last4 is null or last4 ~ '^[0-9]{1,4}$'),safe_data jsonb not null default '{}'::jsonb,occurred_at timestamptz not null,received_at timestamptz not null default now());
create table gimml_terminal.transaction_events(id bigserial primary key,transaction_id text not null references gimml_terminal.transactions(id),event_type text not null,safe_data jsonb not null default '{}'::jsonb,occurred_at timestamptz not null default now());
create table gimml_terminal.device_commands(id uuid primary key,merchant_id uuid not null references gimml_terminal.merchants(id),device_id uuid not null references gimml_terminal.devices(id),capability_key text not null references gimml_terminal.capabilities(key),action text not null check(action in ('void','refund','settlement')),amount_minor bigint check(amount_minor>0),processor_transaction_id text,state gimml_terminal.command_state not null default 'queued',expires_at timestamptz not null,claimed_at timestamptz,completed_at timestamptz,outcome_message text,created_by uuid,created_at timestamptz not null default now(),check((action='refund' and amount_minor is not null) or (action<>'refund' and amount_minor is null)),check((action='void' and processor_transaction_id is not null) or action<>'void'));
create table gimml_terminal.config_snapshots(device_id uuid not null references gimml_terminal.devices(id),revision bigint not null,body_json jsonb not null,body_sha256 bytea not null,issued_at timestamptz not null,expires_at timestamptz not null,signature bytea not null,primary key(device_id,revision),check(expires_at>issued_at));
create table gimml_terminal.audit_events(id bigserial primary key,merchant_id uuid,device_id uuid,actor_id uuid,action text not null,resource_type text not null,resource_id text,decision text not null,reason text,correlation_id uuid not null,occurred_at timestamptz not null default now());
create index on gimml_terminal.devices(merchant_id);create index on gimml_terminal.transactions(device_id,occurred_at desc);create index on gimml_terminal.device_commands(device_id,state,expires_at);create index on gimml_terminal.merchant_entitlements(merchant_id,state);

-- Private by default. Only server-side service code may reach the unified schema.
revoke all on schema gimml_terminal from public,anon,authenticated;
revoke all on all tables in schema gimml_terminal from public,anon,authenticated;
revoke all on all sequences in schema gimml_terminal from public,anon,authenticated;
grant usage on schema gimml_terminal to service_role;
grant select,insert,update,delete on all tables in schema gimml_terminal to service_role;
grant usage,select on all sequences in schema gimml_terminal to service_role;
alter default privileges in schema gimml_terminal revoke all on tables from public,anon,authenticated;
alter default privileges in schema gimml_terminal grant select,insert,update,delete on tables to service_role;
alter default privileges in schema gimml_terminal grant usage,select on sequences to service_role;
alter default privileges in schema gimml_terminal grant execute on functions to service_role;
commit;

-- composed-unified-migrations: 002-012

-- source: 002_server_authorization.sql
begin;
create or replace function gimml_terminal.entitlement_permits(p_device uuid,p_capability text,p_now timestamptz default now()) returns boolean language sql stable security definer set search_path=gimml_terminal,pg_temp as $$
 select exists(select 1 from devices d join merchant_entitlements e on e.merchant_id=d.merchant_id join catalog_items ci on ci.sku=e.sku join capabilities cap on cap.key=e.capability_key left join device_assignments da on da.entitlement_id=e.id and da.device_id=d.id and da.revoked_at is null where d.id=p_device and d.enrollment_state='active' and e.capability_key=p_capability and e.state in ('active','trial') and e.starts_at<=p_now and (e.expires_at is null or e.expires_at>p_now) and ci.active and cap.active and (ci.scope='merchant' or da.id is not null));
$$;
create or replace function gimml_terminal.claim_next_command(p_device uuid,p_now timestamptz default now()) returns setof gimml_terminal.device_commands language plpgsql security definer set search_path=gimml_terminal,pg_temp as $$
declare candidate gimml_terminal.device_commands;
begin
 update device_commands set state='expired',completed_at=p_now where device_id=p_device and state='queued' and expires_at<=p_now;
 select * into candidate from device_commands where device_id=p_device and state='queued' and expires_at>p_now order by created_at for update skip locked limit 1;
 if candidate.id is null then return; end if;
 if not entitlement_permits(p_device,candidate.capability_key,p_now) then update device_commands set state='failed',completed_at=p_now,outcome_message='Capability is not entitled' where id=candidate.id;return;end if;
 update device_commands set state='claimed',claimed_at=p_now where id=candidate.id returning * into candidate;return next candidate;
end;$$;
create or replace function gimml_terminal.complete_claimed_command(p_device uuid,p_command uuid,p_succeeded boolean,p_message text) returns boolean language plpgsql security definer set search_path=gimml_terminal,pg_temp as $$
declare changed integer;
begin
 update device_commands set state=case when p_succeeded then 'succeeded'::command_state else 'failed'::command_state end,completed_at=now(),outcome_message=left(coalesce(p_message,''),500)
 where id=p_command and device_id=p_device and state='claimed';
 get diagnostics changed=row_count;
 return changed=1;
end;$$;
revoke all on all tables in schema gimml_terminal from public;
revoke all on all functions in schema gimml_terminal from public;
commit;


-- source: 003_catalog_seed.sql
begin;
insert into gimml_terminal.profiles(key,display_name) values ('GIMML_ONE','Gimml One'),('GIMML_MINI','Gimml Mini'),('CUSTOM','Custom') on conflict do nothing;
insert into gimml_terminal.capabilities(key,classification,scope,risk) values
('CARD_PRESENT','core','merchant','payment'),('KEYED_ENTRY','paid_add_on','device','pci'),('FIXED_AMOUNT','profile_default','device','low'),('KEYPAD_AMOUNT','profile_default','device','low'),('PRESETS','free_setting','device','low'),('INCREMENT','free_setting','device','low'),('LOCAL_MERCHANT_MENU','profile_default','device','medium'),('VOID','paid_add_on','device','high'),('REFUND','paid_add_on','device','high'),('SETTLEMENT','paid_add_on','device','high'),('CLOSED_LOOP_IDENTIFY','paid_add_on','merchant','medium'),('DASHBOARD_REPORTING','paid_add_on','merchant','medium'),('ADVANCED_REPORTING','paid_add_on','merchant','low'),('FLEET_HEALTH','paid_add_on','merchant','low'),('FLEET_LOCATION','paid_add_on','device','privacy') on conflict do nothing;
insert into gimml_terminal.catalog_items(sku,display_name,capability_key,scope,unit_price_cents,billing_interval) select 'CAP-'||key,key,key,scope,0,'monthly' from gimml_terminal.capabilities on conflict do nothing;
commit;


-- source: 004_device_authentication.sql
begin;
create table gimml_terminal.device_request_nonces(
 device_id uuid not null references gimml_terminal.devices(id) on delete cascade,
 nonce text not null check(nonce ~ '^[A-Za-z0-9_-]{22,64}$'),
 expires_at timestamptz not null,
 primary key(device_id,nonce)
);
create index on gimml_terminal.device_request_nonces(expires_at);

create table gimml_terminal.device_pairing_codes(
 id uuid primary key,
 device_id uuid not null references gimml_terminal.devices(id) on delete cascade,
 code_digest bytea not null unique,
 expires_at timestamptz not null,
 consumed_at timestamptz,
 created_at timestamptz not null default now()
);
create index on gimml_terminal.device_pairing_codes(device_id,expires_at) where consumed_at is null;

alter table gimml_terminal.device_commands add column processor_reference text;

create or replace function gimml_terminal.reserve_device_nonce(p_device uuid,p_nonce text,p_expires timestamptz) returns boolean language plpgsql security definer set search_path=gimml_terminal,pg_temp as $$
begin
 if p_expires<=now() or p_expires>now()+interval '10 minutes' or p_nonce!~'^[A-Za-z0-9_-]{22,64}$' then return false;end if;
 delete from device_request_nonces where expires_at<=now();
 insert into device_request_nonces(device_id,nonce,expires_at) values(p_device,p_nonce,p_expires) on conflict do nothing;
 return found;
end;$$;

create or replace function gimml_terminal.complete_claimed_command(p_device uuid,p_command uuid,p_succeeded boolean,p_message text,p_processor_reference text default null) returns boolean language plpgsql security definer set search_path=gimml_terminal,pg_temp as $$
declare changed integer;
begin
 update device_commands set state=case when p_succeeded then 'succeeded'::command_state else 'failed'::command_state end,completed_at=now(),outcome_message=left(coalesce(p_message,''),500),processor_reference=left(p_processor_reference,128)
 where id=p_command and device_id=p_device and state='claimed';
 get diagnostics changed=row_count;
 return changed=1;
end;$$;

revoke all on gimml_terminal.device_request_nonces,gimml_terminal.device_pairing_codes from public;
revoke all on function gimml_terminal.reserve_device_nonce(uuid,text,timestamptz) from public;
revoke all on function gimml_terminal.complete_claimed_command(uuid,uuid,boolean,text,text) from public;
commit;


-- source: 005_fleet_status.sql
begin;
create table gimml_terminal.device_status(
 device_id uuid primary key references gimml_terminal.devices(id) on delete cascade,
 health_json jsonb not null default '{}'::jsonb,
 latitude double precision,
 longitude double precision,
 accuracy_m real,
 location_recorded_at timestamptz,
 received_at timestamptz not null default now(),
 check(latitude is null or latitude between -90 and 90),
 check(longitude is null or longitude between -180 and 180),
 check(accuracy_m is null or accuracy_m between 0 and 100000)
);
create table gimml_terminal.device_location_requests(
 id uuid primary key,
 device_id uuid not null references gimml_terminal.devices(id) on delete cascade,
 requested_at timestamptz not null default now(),
 fulfilled_at timestamptz,
 expires_at timestamptz not null,
 check(expires_at>requested_at)
);
create index on gimml_terminal.device_location_requests(device_id,requested_at desc) where fulfilled_at is null;
revoke all on gimml_terminal.device_status from public;
revoke all on gimml_terminal.device_location_requests from public;
commit;


-- source: 006_configuration_projection.sql
begin;
create or replace function gimml_terminal.device_configuration_json(p_device uuid,p_now timestamptz default now()) returns jsonb language sql stable security definer set search_path=gimml_terminal,pg_temp as $$
 with selected as(
  select d.id,d.serial_number,d.merchant_id,m.display_name,p.profile_key,p.layout_key,
   coalesce(ds.value_json,ms.value_json,'{"default_cents":0,"preset_cents":[500,1000,1800],"increment_cents":100,"maximum_cents":9999999,"reset_seconds":20}'::jsonb) settings
  from devices d join merchants m on m.id=d.merchant_id join device_profiles p on p.device_id=d.id
  left join device_settings ds on ds.device_id=d.id and ds.key='terminal'
  left join merchant_settings ms on ms.merchant_id=d.merchant_id and ms.key='terminal'
  where d.id=p_device and d.enrollment_state='active'
 ), grants as(
  select coalesce(jsonb_agg(jsonb_build_object('capability',e.capability_key,'state',case e.state::text when 'active' then 'ACTIVE' when 'trial' then 'TRIALING' when 'trialing' then 'TRIALING' when 'past_due' then 'GRACE' when 'grace' then 'GRACE' else 'SUSPENDED' end,'device_assignment_required',ci.scope='device')),'[]'::jsonb) value
  from selected s join merchant_entitlements e on e.merchant_id=s.merchant_id join catalog_items ci on ci.sku=e.sku join capabilities cap on cap.key=e.capability_key
  where e.state::text in('active','trial','trialing','grace','past_due') and e.starts_at<=p_now and(e.expires_at is null or e.expires_at>p_now) and ci.active and cap.active
 ), assignments as(
  select coalesce(jsonb_agg(distinct e.capability_key),'[]'::jsonb) value from selected s join device_assignments da on da.device_id=s.id and da.revoked_at is null join merchant_entitlements e on e.id=da.entitlement_id
 ), programs as(
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id::text,'display_name',c.display_name,'bin_prefix',c.bin_prefix,'enabled',c.enabled) order by c.display_name),'[]'::jsonb) value from selected s join closed_loop_programs c on c.merchant_id=s.merchant_id where c.enabled
 )
 select jsonb_build_object('serial',s.serial_number,'id',s.id::text,'merchantName',s.display_name,'profile',s.profile_key,'layout',s.layout_key,'settings',s.settings,'entitlements',g.value,'assignments',a.value,'closedLoopPrograms',p.value) from selected s cross join grants g cross join assignments a cross join programs p;
$$;
revoke all on function gimml_terminal.device_configuration_json(uuid,timestamptz) from public;
commit;


-- source: 007_configuration_revisions.sql
begin;
create or replace function gimml_terminal.bump_device_revision(p_device uuid) returns void language sql security definer set search_path=gimml_terminal,pg_temp as $$update devices set config_revision=greatest(config_revision+1,1) where id=p_device$$;
create or replace function gimml_terminal.bump_merchant_revisions(p_merchant uuid) returns void language sql security definer set search_path=gimml_terminal,pg_temp as $$update devices set config_revision=greatest(config_revision+1,1) where merchant_id=p_merchant$$;
create or replace function gimml_terminal.configuration_revision_trigger() returns trigger language plpgsql security definer set search_path=gimml_terminal,pg_temp as $$
begin
 if tg_table_name='device_settings' or tg_table_name='device_profiles' then perform bump_device_revision(coalesce(new.device_id,old.device_id));
 elsif tg_table_name='device_assignments' then perform bump_device_revision(coalesce(new.device_id,old.device_id));
 elsif tg_table_name='merchant_settings' or tg_table_name='closed_loop_programs' or tg_table_name='merchant_entitlements' then perform bump_merchant_revisions(coalesce(new.merchant_id,old.merchant_id));
 end if;return coalesce(new,old);
end;$$;
create trigger terminal_revision_device_settings after insert or update or delete on gimml_terminal.device_settings for each row execute function gimml_terminal.configuration_revision_trigger();
create trigger terminal_revision_device_profiles after insert or update or delete on gimml_terminal.device_profiles for each row execute function gimml_terminal.configuration_revision_trigger();
create trigger terminal_revision_assignments after insert or update or delete on gimml_terminal.device_assignments for each row execute function gimml_terminal.configuration_revision_trigger();
create trigger terminal_revision_merchant_settings after insert or update or delete on gimml_terminal.merchant_settings for each row execute function gimml_terminal.configuration_revision_trigger();
create trigger terminal_revision_closed_loop after insert or update or delete on gimml_terminal.closed_loop_programs for each row execute function gimml_terminal.configuration_revision_trigger();
create trigger terminal_revision_entitlements after insert or update or delete on gimml_terminal.merchant_entitlements for each row execute function gimml_terminal.configuration_revision_trigger();
revoke all on function gimml_terminal.bump_device_revision(uuid),gimml_terminal.bump_merchant_revisions(uuid),gimml_terminal.configuration_revision_trigger() from public;
commit;


-- source: 008_server_kill_switch.sql
begin;
create or replace function gimml_terminal.entitlement_permits(p_device uuid,p_capability text,p_now timestamptz default now()) returns boolean language sql stable security definer set search_path=gimml_terminal,pg_temp as $$
 select exists(select 1 from devices d join merchant_entitlements e on e.merchant_id=d.merchant_id join catalog_items ci on ci.sku=e.sku join capabilities cap on cap.key=e.capability_key left join device_assignments da on da.entitlement_id=e.id and da.device_id=d.id and da.revoked_at is null where d.id=p_device and d.enrollment_state='active' and e.capability_key=p_capability and e.state::text in ('active','trial','trialing','grace','past_due') and e.starts_at<=p_now and(e.expires_at is null or e.expires_at>p_now) and ci.active and cap.active and(ci.scope='merchant' or da.id is not null));
$$;
revoke all on function gimml_terminal.entitlement_permits(uuid,text,timestamptz) from public;
commit;


-- source: 009_command_result_fields.sql
begin;
alter table gimml_terminal.device_commands add column transaction_count integer check(transaction_count>=0);
alter table gimml_terminal.device_commands add column total_amount_minor bigint check(total_amount_minor>=0);
alter table gimml_terminal.device_commands add column total_currency char(3);
create or replace function gimml_terminal.complete_claimed_command(p_device uuid,p_command uuid,p_succeeded boolean,p_message text,p_processor_reference text default null,p_transaction_count integer default null,p_total_amount_minor bigint default null,p_total_currency char(3) default null) returns boolean language plpgsql security definer set search_path=gimml_terminal,pg_temp as $$
declare changed integer;
begin
 update device_commands set state=case when p_succeeded then 'succeeded'::command_state else 'failed'::command_state end,completed_at=now(),outcome_message=left(coalesce(p_message,''),500),processor_reference=left(p_processor_reference,128),transaction_count=p_transaction_count,total_amount_minor=p_total_amount_minor,total_currency=p_total_currency
 where id=p_command and device_id=p_device and state='claimed';
 get diagnostics changed=row_count;return changed=1;
end;$$;
revoke all on function gimml_terminal.complete_claimed_command(uuid,uuid,boolean,text,text,integer,bigint,char) from public;
commit;


-- source: 010_plans_billing_reporting.sql
begin;

create type gimml_terminal.subscription_state as enum ('trialing','active','grace','past_due','suspended','cancelled','expired');

create table gimml_terminal.plans(
 key text primary key check(key ~ '^[A-Z0-9_:-]{2,64}$'),
 display_name text not null,
 description text not null default '',
 active boolean not null default true,
 sort_order integer not null default 0,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table gimml_terminal.plan_items(
 plan_key text not null references gimml_terminal.plans(key) on delete cascade,
 sku text not null references gimml_terminal.catalog_items(sku),
 included_quantity integer not null default 1 check(included_quantity>=0),
 unit_price_override_cents bigint check(unit_price_override_cents>=0),
 primary key(plan_key,sku)
);

create table gimml_terminal.merchant_subscriptions(
 id uuid primary key,
 merchant_id uuid not null references gimml_terminal.merchants(id),
 plan_key text not null references gimml_terminal.plans(key),
 state gimml_terminal.subscription_state not null,
 external_customer_id text,
 external_subscription_id text unique,
 current_period_start timestamptz not null,
 current_period_end timestamptz,
 cancel_at_period_end boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index merchant_one_live_subscription on gimml_terminal.merchant_subscriptions(merchant_id) where state in('trialing','active','grace','past_due');

create table gimml_terminal.billing_events(
 provider text not null,
 external_event_id text not null,
 event_type text not null,
 merchant_id uuid references gimml_terminal.merchants(id),
 payload_sha256 bytea not null,
 received_at timestamptz not null default now(),
 processed_at timestamptz,
 outcome text,
 primary key(provider,external_event_id)
);

insert into gimml_terminal.plans(key,display_name,description,sort_order) values
 ('GIMML_ONE','Gimml One','One layout with all compatible capabilities selectable',10),
 ('GIMML_MINI','Gimml Mini','Mini layout with every compatible capability selectable',20),
 ('CUSTOM','Custom','Choose layout and capabilities independently within compatibility rules',30)
on conflict do nothing;

insert into gimml_terminal.plan_items(plan_key,sku,included_quantity)
select 'GIMML_ONE',sku,1 from gimml_terminal.catalog_items where capability_key not in('KEYPAD_AMOUNT','KEYED_ENTRY','LOCAL_MERCHANT_MENU')
on conflict do nothing;
insert into gimml_terminal.plan_items(plan_key,sku,included_quantity)
select 'GIMML_MINI',sku,1 from gimml_terminal.catalog_items where capability_key not in('FIXED_AMOUNT','INCREMENT')
on conflict do nothing;

create view gimml_terminal.dashboard_transactions as
select t.id transaction_id,t.merchant_id,t.device_id,d.serial_number,t.amount_minor,t.currency,t.status,
 t.processor_reference,t.last4,t.safe_data->>'authorization_code' authorization_code,
 t.safe_data->>'reference_number' reference_number,t.safe_data->>'batch_id' batch_id,
 t.safe_data->>'trace_number' trace_number,t.safe_data->>'card_issuer' card_issuer,
 t.safe_data->>'account_type' account_type,t.safe_data->>'entry_method' entry_method,
 t.safe_data->>'payment_program' payment_program,t.safe_data->>'result_code' result_code,
 t.safe_data->>'transaction_type' transaction_type,t.safe_data->>'card_type' card_type,
 t.safe_data->>'host_message' host_message,(t.safe_data->>'base_amount_minor')::bigint base_amount_minor,
 (t.safe_data->>'tip_amount_minor')::bigint tip_amount_minor,(t.safe_data->>'fee_amount_minor')::bigint fee_amount_minor,
 (t.safe_data->>'cashback_amount_minor')::bigint cashback_amount_minor,(t.safe_data->>'processed_amount_minor')::bigint processed_amount_minor,
 t.safe_data->>'closed_loop_program' closed_loop_program,t.occurred_at,t.received_at
from gimml_terminal.transactions t join gimml_terminal.devices d on d.id=t.device_id;

create or replace function gimml_terminal.merchant_report(p_merchant uuid,p_from timestamptz,p_to timestamptz,p_device uuid default null)
returns table(currency char(3),approved_count bigint,declined_count bigint,failed_count bigint,approved_minor numeric,refund_minor numeric)
language sql stable security definer set search_path=gimml_terminal,pg_temp as $$
 select t.currency,count(*) filter(where t.status='approved'),count(*) filter(where t.status='declined'),count(*) filter(where t.status='failed'),
 coalesce(sum(t.amount_minor) filter(where t.status='approved' and coalesce(t.safe_data->>'transaction_type','sale')<>'refund'),0),
 coalesce(sum(t.amount_minor) filter(where t.safe_data->>'transaction_type'='refund'),0)
 from transactions t where t.merchant_id=p_merchant and t.occurred_at>=p_from and t.occurred_at<p_to and(p_device is null or t.device_id=p_device)
 group by t.currency;
$$;

revoke all on gimml_terminal.plans,gimml_terminal.plan_items,gimml_terminal.merchant_subscriptions,gimml_terminal.billing_events,gimml_terminal.dashboard_transactions from public;
revoke all on function gimml_terminal.merchant_report(uuid,timestamptz,timestamptz,uuid) from public;
commit;


-- source: 011_entitlement_state_alignment.sql
alter type gimml_terminal.entitlement_state add value if not exists 'trialing';
alter type gimml_terminal.entitlement_state add value if not exists 'grace';

begin;
create or replace function gimml_terminal.device_configuration_json(p_device uuid,p_now timestamptz default now()) returns jsonb language sql stable security definer set search_path=gimml_terminal,pg_temp as $$
 with selected as(
  select d.id,d.serial_number,d.merchant_id,m.display_name,p.profile_key,p.layout_key,
   coalesce(ds.value_json,ms.value_json,'{"default_cents":0,"preset_cents":[500,1000,1800],"increment_cents":100,"maximum_cents":9999999,"reset_seconds":20}'::jsonb) settings
  from devices d join merchants m on m.id=d.merchant_id join device_profiles p on p.device_id=d.id
  left join device_settings ds on ds.device_id=d.id and ds.key='terminal'
  left join merchant_settings ms on ms.merchant_id=d.merchant_id and ms.key='terminal'
  where d.id=p_device and d.enrollment_state='active'
 ), grants as(
  select coalesce(jsonb_agg(jsonb_build_object('capability',e.capability_key,'state',case e.state::text when 'active' then 'ACTIVE' when 'trial' then 'TRIALING' when 'trialing' then 'TRIALING' when 'past_due' then 'GRACE' when 'grace' then 'GRACE' else 'SUSPENDED' end,'device_assignment_required',ci.scope='device')),'[]'::jsonb) value
  from selected s join merchant_entitlements e on e.merchant_id=s.merchant_id join catalog_items ci on ci.sku=e.sku join capabilities cap on cap.key=e.capability_key
  where e.state::text in('active','trial','trialing','grace','past_due') and e.starts_at<=p_now and(e.expires_at is null or e.expires_at>p_now) and ci.active and cap.active
 ), assignments as(
  select coalesce(jsonb_agg(distinct e.capability_key),'[]'::jsonb) value from selected s join device_assignments da on da.device_id=s.id and da.revoked_at is null join merchant_entitlements e on e.id=da.entitlement_id
 ), programs as(
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id::text,'display_name',c.display_name,'bin_prefix',c.bin_prefix,'enabled',c.enabled) order by c.display_name),'[]'::jsonb) value from selected s join closed_loop_programs c on c.merchant_id=s.merchant_id where c.enabled
 )
 select jsonb_build_object('serial',s.serial_number,'id',s.id::text,'merchantName',s.display_name,'profile',s.profile_key,'layout',s.layout_key,'settings',s.settings,'entitlements',g.value,'assignments',a.value,'closedLoopPrograms',p.value) from selected s cross join grants g cross join assignments a cross join programs p;
$$;
create or replace function gimml_terminal.entitlement_permits(p_device uuid,p_capability text,p_now timestamptz default now()) returns boolean language sql stable security definer set search_path=gimml_terminal,pg_temp as $$
 select exists(select 1 from devices d join merchant_entitlements e on e.merchant_id=d.merchant_id join catalog_items ci on ci.sku=e.sku join capabilities cap on cap.key=e.capability_key left join device_assignments da on da.entitlement_id=e.id and da.device_id=d.id and da.revoked_at is null where d.id=p_device and d.enrollment_state='active' and e.capability_key=p_capability and e.state::text in('active','trial','trialing','grace','past_due') and e.starts_at<=p_now and(e.expires_at is null or e.expires_at>p_now) and ci.active and cap.active and(ci.scope='merchant' or da.id is not null));
$$;
revoke all on function gimml_terminal.entitlement_permits(uuid,text,timestamptz) from public;
revoke all on function gimml_terminal.device_configuration_json(uuid,timestamptz) from public;
commit;


-- source: 012_apk_identity_pairing.sql
begin;
alter table gimml_terminal.device_pairing_codes add column expected_application_id text check(expected_application_id ~ '^com\.gimml\.terminal(\.debug)?$');
alter table gimml_terminal.device_pairing_codes add column expected_signing_cert_sha256 bytea check(octet_length(expected_signing_cert_sha256)=32);
-- Existing unbound codes intentionally become unusable and must be replaced with identity-bound codes.
update gimml_terminal.device_pairing_codes set consumed_at=coalesce(consumed_at,now()) where expected_application_id is null or expected_signing_cert_sha256 is null;
commit;

-- Additive bridge: preserve existing dashboard UUIDs and serial assignments.
-- Legacy rows remain unchanged and continue to serve the existing applications.
begin;
insert into gimml_terminal.merchants(id,display_name,currency,timezone,billing_status)
select id,name,'USD','America/New_York','active'
from public.merchants
on conflict(id) do update set display_name=excluded.display_name;

insert into gimml_terminal.devices(id,merchant_id,serial_number,enrollment_state,last_seen_at)
select id,merchant_id,serial_number,
       case when status::text='active' then 'eligible' else 'suspended' end,
       last_seen_at
from public.devices
where merchant_id is not null
  and serial_number ~ '^[A-Za-z0-9._:-]{1,128}$'
on conflict(id) do update set
  merchant_id=excluded.merchant_id,
  serial_number=excluded.serial_number,
  enrollment_state=excluded.enrollment_state,
  last_seen_at=excluded.last_seen_at;

insert into gimml_terminal.device_profiles(device_id,profile_key,layout_key)
select id,
       case when serial_number='645900045' then 'GIMML_MINI' else 'GIMML_ONE' end,
       case when serial_number='645900045' then 'MINI' else 'ONE' end
from gimml_terminal.devices
on conflict(device_id) do nothing;
commit;

begin;
create or replace function gimml_terminal.consume_pairing_code_and_enroll(p_serial text,p_code_digest bytea,p_public_key_der bytea,p_now timestamptz,p_key_fingerprint text,p_application_id text,p_signing_certificate_sha256 bytea) returns uuid language plpgsql security definer set search_path=gimml_terminal,pg_temp as $$
declare enrolled_device uuid;
begin
 update device_pairing_codes p set consumed_at=p_now from devices d where p.device_id=d.id and d.serial_number=p_serial and p.code_digest=p_code_digest and p.expected_application_id=p_application_id and p.expected_signing_cert_sha256=p_signing_certificate_sha256 and p.consumed_at is null and p.expires_at>p_now returning d.id into enrolled_device;
 if enrolled_device is null then return null; end if;
 update devices set public_key_der=p_public_key_der,key_fingerprint=p_key_fingerprint,enrollment_state='active',last_seen_at=p_now where id=enrolled_device;
 return enrolled_device;
end;
$$;
revoke all on function gimml_terminal.consume_pairing_code_and_enroll(text,bytea,bytea,timestamptz,text,text,bytea) from public,anon,authenticated;
grant execute on function gimml_terminal.consume_pairing_code_and_enroll(text,bytea,bytea,timestamptz,text,text,bytea) to service_role;
-- PostgREST may route requests to this schema, but SQL grants still restrict every
-- object to the server-side service role. Browser roles retain no schema access.
alter role authenticator set pgrst.db_schemas='public,storage,graphql_public,gimml_terminal';
notify pgrst,'reload config';

grant execute on all functions in schema gimml_terminal to service_role;
revoke execute on all functions in schema gimml_terminal from anon,authenticated;
commit;
