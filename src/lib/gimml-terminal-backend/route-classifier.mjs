const TERMINAL=new Set(['/device/login','/device/enroll','/device/commands','/device/command-result','/device/status','/transaction/create']);
export function classifyRoute(path){if(TERMINAL.has(path))return 'terminal';if(/^\/api\/dashboard\/[^/]+\//.test(path))return 'dashboard';return 'static';}
