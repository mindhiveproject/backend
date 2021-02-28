const journalMutations = {
  // create journal
  async createJournal(parent, args, ctx, info) {
    console.log('args', args);

    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do that!');
    }

    const journal = await ctx.db.mutation.createJournal(
      {
        data: {
          creator: {
            connect: {
              id: ctx.request.userId,
            },
          },
          ...args,
        },
      },
      info
    );

    return journal;
  },

  // update the journal
  updateJournal(parent, args, ctx, info) {
    // take a copy of updates
    const updates = { ...args };
    // remove the ID from the updates
    delete updates.id;
    // run the update method
    return ctx.db.mutation.updateJournal(
      {
        data: updates,
        where: {
          id: args.id,
        },
      },
      info
    );
  },

  // delete journal
  async deleteJournal(parent, args, ctx, info) {
    const where = { id: args.id };
    // find journal
    const journal = await ctx.db.query.journal(
      { where },
      `{ id creator {id} posts {id} }`
    );
    // check whether user has permissions to delete the item
    const ownsJournal = journal.creator.id === ctx.request.userId;
    const hasPermissions = ctx.request.user.permissions.some(permission =>
      ['ADMIN'].includes(permission)
    );
    if (!ownsJournal && !hasPermissions) {
      throw new Error(`You don't have permission to do that!`);
    }

    // delete all notes in the journal
    const postIds = journal.posts.map(post => post.id);
    await ctx.db.mutation.deleteManyPosts({
      where: {
        id_in: postIds,
      },
    });

    // delete the journal
    return ctx.db.mutation.deleteJournal({ where }, info);
  },
};

module.exports = journalMutations;
