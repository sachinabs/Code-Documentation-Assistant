import { prisma } from '../config/database.js';
import * as llmService from '../services/llm.service.js';

export async function generateMilestone(req, res, next) {
  try {
    const { conversationId } = req.body || {};
    if (!conversationId) return res.status(400).json({ message: 'conversationId is required' });
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });
    const result = await llmService.generateMilestone(conversation.messages, conversation.summary);
    if (!result) return res.status(500).json({ message: 'Failed to generate milestone' });
    res.json(result);
  } catch (err) { next(err); }
}

export async function listMilestones(req, res, next) {
  try {
    const milestones = await prisma.milestone.findMany({
      where: { repositoryId: req.params.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json(milestones);
  } catch (err) { next(err); }
}

export async function createMilestone(req, res, next) {
  try {
    const { title, description, summary, decisions, technologies, keyFiles, completedWork, pendingWork, recommendations, references, conversationId } = req.body || {};
    if (!title || !summary) return res.status(400).json({ message: 'title and summary are required' });
    const m = await prisma.milestone.create({
      data: {
        repositoryId: req.params.id,
        conversationId,
        title,
        description,
        summary,
        decisions,
        technologies,
        keyFiles,
        completedWork,
        pendingWork,
        recommendations,
        references,
      },
    });
    res.status(201).json(m);
  } catch (err) { next(err); }
}

export async function updateMilestone(req, res, next) {
  try {
    const { title, description, summary, keyFiles, references } = req.body || {};
    const m = await prisma.milestone.update({
      where: { id: req.params.milestoneId },
      data: { title, description, summary, keyFiles, references },
    });
    res.json(m);
  } catch (err) { next(err); }
}

export async function deleteMilestone(req, res, next) {
  try {
    await prisma.milestone.delete({ where: { id: req.params.milestoneId } });
    res.status(204).send();
  } catch (err) { next(err); }
}