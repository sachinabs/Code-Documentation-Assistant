import 'dotenv/config';
import { prisma } from './src/config/database.js';
const repo = await prisma.repository.findUnique({ where: { id: 'cmwgahcic0001cx5hm9izys7a' } });
console.log(JSON.stringify(repo.techStack, null, 2));
await prisma.$disconnect();