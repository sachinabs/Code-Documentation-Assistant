import 'dotenv/config';
const body = { repositoryId: 'cmwghw0lc0000g1sqpa9maz49', question: 'What features are missing and how can we improve the project?', conversationId: null };
const res = await fetch('http://localhost:5000/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const text = await res.text();
console.log('STATUS', res.status);
console.log(text.slice(0, 2000));
import fs from 'fs';
fs.writeFileSync('C:/Users/Asus/AppData/Local/Temp/opencode/improve_result.json', text);