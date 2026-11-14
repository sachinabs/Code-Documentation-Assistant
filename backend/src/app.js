import express from 'express';
import cors from 'cors';
import repositoryRoutes from './routes/repository.routes.js';
import chatRoutes from './routes/chat.routes.js';
import milestoneRoutes from './routes/milestone.routes.js';
import { errorHandler } from './middleware/error.middleware.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/repositories', repositoryRoutes);
app.use('/api/chat', chatRoutes);

// conversations messages endpoint
import { Router } from 'express';
import * as chatController from './controllers/chat.controller.js';
const convRouter = Router();
convRouter.get('/:id/messages', chatController.getMessages);
convRouter.put('/:id', chatController.renameConversation);
convRouter.delete('/:id', chatController.deleteConversation);
app.use('/api/conversations', convRouter);
app.use('/api/milestones', milestoneRoutes);

app.use(errorHandler);

export default app;