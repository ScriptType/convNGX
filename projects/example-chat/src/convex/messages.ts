import { v } from 'convex/values';
import { query, mutation } from './_generated/server';
import { Id } from './_generated/dataModel';
import { betterAuthComponent } from './auth';

export const getMessages = query({
  args: {},
  returns: v.array(
    v.object({
      user: v.optional(
        v.object({
          _id: v.id('users'),
          email: v.string(),
          name: v.string(),
          _creationTime: v.number(),
        }),
      ),
      message: v.object({
        _id: v.id('messages'),
        _creationTime: v.number(),
        userId: v.id('users'),
        content: v.string(),
        createdAt: v.number(),
      }),
    }),
  ),
  handler: async (ctx) => {
    const messages = await ctx.db
      .query('messages')
      .withIndex('by_createdAt')
      .order('desc')
      .take(50);

    const messagesWithUserInfo = await Promise.all(
      messages.map(async (message) => {
        const user = await ctx.db.get(message.userId);
        return {
          ...(user ? { user } : {}),
          message,
        };
      }),
    );

    return messagesWithUserInfo.reverse();
  },
});

export const getFilteredMessagesByContent = query({
  args: {
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error('User not authenticated');
    }
    // The component provides a convenience method to get the user id
    const userId = (await betterAuthComponent.getAuthUserId(ctx)) as Id<'users'>;
    if (!userId) {
      throw new Error('User not authenticated');
    }

    const messages =
      args.content === ''
        ? await ctx.db.query('messages').collect()
        : await ctx.db
            .query('messages')
            .withSearchIndex('search_content', (q) => q.search('content', args.content))
            .collect();

    const messagesWithUserInfo = await Promise.all(
      messages.map(async (message) => {
        const user = await ctx.db.get(message.userId);
        return {
          ...(user ? { user } : {}),
          message,
        };
      }),
    );

    return messagesWithUserInfo;
  },
});

export const sendMessage = mutation({
  args: {
    content: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { content }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error('User not authenticated');
    }
    // The component provides a convenience method to get the user id
    const userId = (await betterAuthComponent.getAuthUserId(ctx)) as Id<'users'>;
    if (!userId) {
      throw new Error('User not authenticated');
    }

    const trimmedContent = content.trim();
    if (!trimmedContent) {
      throw new Error('Message cannot be empty');
    }

    if (trimmedContent.length > 1000) {
      throw new Error('Message too long');
    }

    await ctx.db.insert('messages', {
      userId,
      content: trimmedContent,
      createdAt: Date.now(),
    });

    return null;
  },
});
