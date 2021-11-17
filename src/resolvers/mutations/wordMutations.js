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
          settings: args.settings,
        },
      },
      info
    );
    return word;
  },

  // update the word

  // delete word
};

module.exports = wordMutations;
