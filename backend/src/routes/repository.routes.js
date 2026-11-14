import { Router } from 'express';
import * as repoController from '../controllers/repository.controller.js';
import * as chatController from '../controllers/chat.controller.js';
import * as milestoneController from '../controllers/milestone.controller.js';

const router = Router();

router.post('/', repoController.createRepository);
router.get('/', repoController.listRepositories);
router.get('/:id', repoController.getRepository);
router.get('/:id/status', repoController.getStatus);
router.get('/:id/files', repoController.getFiles);
router.get('/:id/files/content', repoController.getFileContent);
router.get('/:id/conversations', chatController.listConversations);
router.get('/:id/apis', repoController.getApis);
router.post('/:id/reindex', repoController.reindexRepository);
router.delete('/:id', repoController.deleteRepository);

// milestones
router.get('/:id/milestones', milestoneController.listMilestones);
router.post('/:id/milestones', milestoneController.createMilestone);
router.post('/:id/milestones/generate', milestoneController.generateMilestone);

export default router;