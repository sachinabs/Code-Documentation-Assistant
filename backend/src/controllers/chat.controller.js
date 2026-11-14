import { prisma } from '../config/database.js';
import * as retrievalService from '../services/retrieval.service.js';
import * as llmService from '../services/llm.service.js';

export async function chat(req, res, next) {
  try {
    const { repositoryId, question, conversationId } = req.body || {};
    if (!repositoryId || !question) {
      return res.status(400).json({ message: 'repositoryId and question are required' });
    }

    let conversation = null;
    if (conversationId) {
      conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
    }
    if (!conversation) {
      const title = question.length > 40 ? question.slice(0, 40) + '...' : question;
      conversation = await prisma.conversation.create({ data: { repositoryId, title } });
    } else if (!conversation.title) {
      const title = question.length > 40 ? question.slice(0, 40) + '...' : question;
      conversation = await prisma.conversation.update({ where: { id: conversation.id }, data: { title } });
    }

    await prisma.message.create({
      data: { conversationId: conversation.id, role: 'user', content: question },
    });

    const history = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
    });

    const repo = await prisma.repository.findUnique({ where: { id: repositoryId } });
    console.log('Chat request - repositoryId:', repositoryId, 'conversationId:', conversationId);
    if (!repo) return res.status(404).json({ message: 'Repository not found' });
    if (repo.status !== 'completed') return res.status(400).json({ message: 'Repository indexing is not completed' });
    const chunks = await retrievalService.retrieveContext(repositoryId, question, repo);
    console.log('Retrieved chunks:', chunks.length, chunks.map((c) => c.filePath));

    // Relevant milestones as context
    const allMilestones = await prisma.milestone.findMany({ where: { repositoryId } });
    const qLower = question.toLowerCase();
    const scored = allMilestones.map((m) => {
      const text = `${m.title} ${m.summary}`.toLowerCase();
      const score = qLower.split(/\s+/).filter((w) => w.length > 3 && text.includes(w)).length;
      return { m, score };
    });
    const relevant = scored.sort((a, b) => b.score - a.score).slice(0, 3).map((x) => x.m);
    for (const m of relevant) {
      chunks.push({
        filePath: `milestone: ${m.title}`,
        language: 'text',
        startLine: 1,
        endLine: 1,
        content: m.summary,
      });
    }
    if (relevant.length) console.log('Milestones injected:', relevant.map((m) => m.title));

    // Conversation summary as context
    if (conversation.summary) {
      chunks.unshift({
        filePath: 'conversation summary',
        language: 'text',
        startLine: 1,
        endLine: 1,
        content: conversation.summary,
      });
    }

    const result = await llmService.generateAnswer(question, chunks, history.map((m) => ({ role: m.role, content: m.content })));
    const answer = result.answer;
    const diagram = result.diagram;

    await prisma.message.create({
      data: { conversationId: conversation.id, role: 'assistant', content: answer },
    });

    // Update conversation summary periodically.
    const allMessages = await prisma.message.findMany({ where: { conversationId: conversation.id }, orderBy: { createdAt: 'asc' } });
    if (allMessages.length >= 8 && allMessages.length % 4 === 0) {
      const summary = await llmService.summarizeConversation(allMessages);
      if (summary) {
        await prisma.conversation.update({ where: { id: conversation.id }, data: { summary } });
      }
    }

    const sources = chunks
      .filter((c) => c.filePath && !c.filePath.startsWith('milestone:') && c.filePath !== 'conversation summary' && c.filePath !== 'repository metadata')
      .map((c) => ({
        filePath: c.filePath,
        startLine: c.startLine,
        endLine: c.endLine,
      }));

    res.json({ answer, diagram, sources, conversationId: conversation.id });
  } catch (err) {
    next(err);
  }
}

export async function listConversations(req, res, next) {
  try {
    const conversations = await prisma.conversation.findMany({
      where: { repositoryId: req.params.id },
      orderBy: { createdAt: 'desc' },
      include: { messages: true },
    });
    res.json(conversations);
  } catch (err) {
    next(err);
  }
}

export async function renameConversation(req, res, next) {
  try {
    const { title } = req.body || {};
    const conv = await prisma.conversation.update({
      where: { id: req.params.id },
      data: { title },
    });
    res.json(conv);
  } catch (err) {
    next(err);
  }
}

export async function deleteConversation(req, res, next) {
  try {
    await prisma.conversation.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function getMessages(req, res, next) {
  try {
    const messages = await prisma.message.findMany({
      where: { conversationId: req.params.id },
      orderBy: { createdAt: 'asc' },
    });
    res.json(messages);
  } catch (err) {
    next(err);
  }
}