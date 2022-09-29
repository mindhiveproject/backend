const wordMutations = {
  async createWord(parent, args, ctx, info) {
    // Check login
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do that!');
    }

    const word = await ctx.db.mutation.createWord(
      {
        data: {
          talk: {
            connect: {
              id: args.talk,
            },
          },
          author: {
            connect: {
              id: ctx.request.userId,
            },
          },
          message: args.message,
          isMain: args.isMain,
          parent: args.parent
            ? {
                connect: {
                  id: args.parent,
                },
              }
            : null,
          settings: args.settings,
        },
      },
      info
    );
    return word;
  },

  // update the message in the chat (post in the forum)
  async updateWord(parent, args, ctx, info) {
    // take a copy of updates
    const updates = { ...args };
    // remove the ID from the updates
    delete updates.id;
    const word = await ctx.db.mutation.updateWord(
      {
        data: { ...updates },
        where: {
          id: args.id,
        },
      },
      info
    );
    return word;
  },

  // delete word
  async deleteWord(parent, args, ctx, info) {
    const where = { id: args.id };
    await ctx.db.mutation.deleteWord({ where }, info);
    return { message: 'You deleted the message!' };
  },
};

module.exports = wordMutations;
