import { v } from 'convex/values';
import { query } from './_generated/server';
import { Id } from './_generated/dataModel';
export const getCurrentUser = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id('users'),
      email: v.string(),
      name: v.string(),
      _creationTime: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }
    // For now the id type requires an assertion
    const userIdFromCtx = identity.subject as Id<'users'>;

    const user = await ctx.db.get(userIdFromCtx);

    // You can combine them if you want
    return user;
  },
});
