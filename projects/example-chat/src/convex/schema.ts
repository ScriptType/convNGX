import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  users: defineTable({
    email: v.string(),
    name: v.string(),
  }).index('by_email', ['email']),
  messages: defineTable({
    userId: v.id('users'),
    content: v.string(),
    createdAt: v.number(),
  })
    .index('by_createdAt', ['createdAt'])
    .searchIndex('search_content', { searchField: 'content' }),
});
