const wordMutations = {
  async createWord(parent, args, ctx, info) {
    // Check login
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do that!');
    }

    // save new message in the database
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

    // create updates for all chat members
    // 1. find the talk
    const talk = await ctx.db.query.talk(
      {
        where: { id: args.talk },
      },
      `{ id
        settings
        members { id }
        studies { id author { id } collaborators { id } }
        classes { id creator { id } mentors { id } students { id } }
      }`
    );
    // 2. find all members, members of studies and classes
    const members = talk?.members.map(m => m.id);

    const studyMembers = [
      ...talk?.studies?.map(study => study?.author?.id),
      ...talk?.studies?.map(study => study?.collaborators?.map(c => c?.id)),
    ].flat(1);

    const classMembers = [
      ...talk?.classes?.map(theClass => theClass?.creator?.id),
      ...talk?.classes?.map(theClass => theClass?.mentors?.map(m => m?.id)),
      ...talk?.classes?.map(theClass => theClass?.students?.map(s => s?.id)),
    ].flat(1);

    // 3. remove the user's own ID from the list
    const forUsers = [
      ...new Set([...members, ...studyMembers, ...classMembers]),
    ].filter(id => !!id && id !== ctx.request.userId);

    // 4. create an update for all members
    await forUsers.map(async user => {
      await ctx.db.mutation.createUpdate(
        {
          data: {
            user: {
              connect: { id: user },
            },
            updateArea: 'CHAT',
            link: '/dashboard/chat',
            content: {
              message: `There is a new message in the chat ${talk?.settings?.title}`,
            },
          },
        },
        `{ id }`
      );
    });

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
    const word = await ctx.db.query.word({ where }, `{ author {id} }`);
    const ownsWord = word.author.id === ctx.request.userId;
    const hasPermissions = ctx.request.user.permissions.some(permission =>
      ['ADMIN', 'TEACHER'].includes(permission)
    );

    if (!ownsWord && !hasPermissions) {
      throw new Error(`You don't have permission to do that!`);
    }

    await ctx.db.mutation.deleteWord({ where }, info);
    return { message: 'You deleted the message!' };
  },
};

module.exports = wordMutations;
