import 'dotenv/config';
import { detectTechStack } from './src/services/file-scanner.service.js';
const stack = await detectTechStack('D:\\Projects\\Task\\Repo Mind - AI\\backend\\storage\\repositories\\sachinabs__volga__cmwgahcic0001cx5hm9izys7a');
console.log(JSON.stringify(stack.capabilities, null, 2));