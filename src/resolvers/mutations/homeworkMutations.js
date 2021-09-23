const homeworkMutations = {
  async createHomework(parent, args, ctx, info) {
    // Check login
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do that!');
    }

    const newHomework = { ...args };
    delete newHomework.assignmentId;

    const homework = await ctx.db.mutation.createHomework(
      {
        data: {
          author: {
            connect: {
              id: ctx.request.userId,
            },
          },
          assignment: {
            connect: {
              id: args.assignmentId,
            },
          },
          ...newHomework,
        },
      },
      info
    );

    return homework;
  },

  // update the homework
  updateHomework(parent, args, ctx, info) {
    console.log('args', args);
    // take a copy of updates
    const updates = { ...args };
    // remove the ID from the updates
    delete updates.id;
    // run the update method
    return ctx.db.mutation.updateHomework(
      {
        data: updates,
        where: {
          id: args.id,
        },
      },
      info
    );
  },

  // delete homework
  async deleteHomework(parent, args, ctx, info) {
    const where = { id: args.id };
    // find homework
    const homework = await ctx.db.query.homework(
      { where },
      `{ id author {id} }`
    );
    // check whether user has permissions to delete the item
    const ownsHomework = homework.author.id === ctx.request.userId;
    const hasPermissions = ctx.request.user.permissions.some(permission =>
      ['ADMIN'].includes(permission)
    );
    if (!ownsHomework && !hasPermissions) {
      throw new Error(`You don't have permission to do that!`);
    }

    // delete it
    return ctx.db.mutation.deleteHomework({ where }, info);
  },
};

module.exports = homeworkMutations;
