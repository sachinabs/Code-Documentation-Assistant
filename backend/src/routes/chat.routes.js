import { Router } from 'express';
import * as controller from '../controllers/chat.controller.js';

const router = Router();

router.post('/', controller.chat);
router.get('/:id/messages', controller.getMessages);
router.put('/:id', controller.renameConversation);
router.delete('/:id', controller.deleteConversation);

export default router;