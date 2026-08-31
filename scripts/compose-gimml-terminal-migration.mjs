import {appendFile,readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const destination=resolve(root,'supabase/migrations/20260831193645_gimml_terminal_platform.sql');
const sourceRoot=resolve(root,'../backend/migrations');
const sources=[
  '002_server_authorization.sql',
  '003_catalog_seed.sql',
  '004_device_authentication.sql',
  '005_fleet_status.sql',
  '006_configuration_projection.sql',
  '007_configuration_revisions.sql',
  '008_server_kill_switch.sql',
  '009_command_result_fields.sql',
  '010_plans_billing_reporting.sql',
  '011_entitlement_state_alignment.sql',
  '012_apk_identity_pairing.sql'
];
const marker='-- composed-unified-migrations: 002-012';
const current=await readFile(destination,'utf8');
if(current.includes(marker))throw new Error('Unified migration layers are already composed');
let addition=`\n${marker}\n`;
for(const name of sources)addition+=`\n-- source: ${name}\n${await readFile(resolve(sourceRoot,name),'utf8')}\n`;
await appendFile(destination,addition,'utf8');
