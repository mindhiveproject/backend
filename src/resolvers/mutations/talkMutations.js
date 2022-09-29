const talkMutations = {
  async createTalk(parent, args, ctx, info) {
    // Check login
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do that!');
    }
    // transform arrays of IDs
    const members = args.members.map(member => ({ id: member }));
    const classes = args.classes.map(theClass => ({ id: theClass }));
    const studies = args.studies.map(study => ({ id: study }));

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
          classes: {
            connect: classes,
          },
          studies: {
            connect: studies,
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
    const where = { id: args.id };
    const chat = await ctx.db.query.talk({ where }, `{ members {id} }`);
    const isChatMember = chat.members
      .map(member => member.id)
      .includes(ctx.request.userId);
    if (!isChatMember) {
      throw new Error(`You are not a member of the chat!`);
    }

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

  // delete the group chat
  async deleteGroupChat(parent, args, ctx, info) {
    // check login
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do that!');
    }
    // check that the user is the author of the group chat
    const where = { id: args.id };
    const chat = await ctx.db.query.talk(
      { where },
      `{ author {id} words {id}}`
    );
    const ownsChat = chat.author.id === ctx.request.userId;
    if (!ownsChat) {
      throw new Error(`You don't have permission to do that!`);
    }
    // delete all messages
    await ctx.db.mutation.deleteManyWords(
      { where: { id_in: chat.words.map(word => word.id) } },
      info
    );

    // disconnect the current user
    return ctx.db.mutation.deleteTalk({ where }, info);
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
