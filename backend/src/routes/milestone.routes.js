import { Router } from 'express';
import * as controller from '../controllers/milestone.controller.js';

const router = Router();
router.put('/:milestoneId', controller.updateMilestone);
router.delete('/:milestoneId', controller.deleteMilestone);

export default router;