const talkMutations = {
  async createTalk(parent, args, ctx, info) {
    console.log('args', args);
    // Check login
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do that!');
    }

    // transform array of members
    const members = args.members.map(member => ({ id: member }));
    console.log('members', members);

    const talk = await ctx.db.mutation.createTalk(
      {
        data: {
          author: {
            connect: {
              id: ctx.request.userId,
            },
          },
          members: {
            connect: members,
          },
          settings: args.settings,
        },
      },
      info
    );
    return talk;
  },

  // update the talk

  // delete talk
};

module.exports = talkMutations;
