const talkMutations = {
  async createTalk(parent, args, ctx, info) {
    // Check login
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do that!');
    }
    // transform array of members
    const members = args.members.map(member => ({ id: member }));
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

  // add new members to the group chat
  async addMembersToTalk(parent, args, ctx, info) {
    // check login
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do that!');
    }
    // check that the user is the member of the talk
    // TODO

    // add new members
    // transform array of members
    const members = args.members.map(member => ({ id: member }));
    return ctx.db.mutation.updateTalk(
      {
        data: {
          members: {
            connect: members,
          },
        },
        where: {
          id: args.id,
        },
      },
      info
    );
  },

  // leave the group chat
  async leaveGroupChat(parent, args, ctx, info) {
    // check login
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do that!');
    }
    // check that the user is the member of the group chat
    // TODO

    // disconnect the current user
    return ctx.db.mutation.updateTalk(
      {
        data: {
          members: {
            disconnect: { id: ctx.request.userId },
          },
        },
        where: {
          id: args.id,
        },
      },
      info
    );
  },

  // update chat settings
  async updateChatSettings(parent, args, ctx, info) {
    // check login
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do that!');
    }
    // check that the user is the member of the group chat
    // TODO

    // disconnect the current user
    return ctx.db.mutation.updateTalk(
      {
        data: {
          settings: args.settings,
        },
        where: {
          id: args.id,
        },
      },
      info
    );
  },

  // delete talk
};

module.exports = talkMutations;
