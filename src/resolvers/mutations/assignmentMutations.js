const assignmentMutations = {
  async createAssignment(parent, args, ctx, info) {
    // Check login
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do that!');
    }

    const newAssignment = { ...args };
    delete newAssignment.classId;

    const assignment = await ctx.db.mutation.createAssignment(
      {
        data: {
          author: {
            connect: {
              id: ctx.request.userId,
            },
          },
          classes: {
            connect: {
              id: args.classId,
            },
          },
          ...newAssignment,
        },
      },
      info
    );

    return assignment;
  },

  // update the assignment
  updateAssignment(parent, args, ctx, info) {
    // take a copy of updates
    const updates = { ...args };
    // remove the ID from the updates
    delete updates.id;
    // run the update method
    return ctx.db.mutation.updateAssignment(
      {
        data: updates,
        where: {
          id: args.id,
        },
      },
      info
    );
  },

  // delete assignment
  async deleteAssignment(parent, args, ctx, info) {
    const where = { id: args.id };
    // find assignment
    const assignment = await ctx.db.query.assignment(
      { where },
      `{ id author {id} }`
    );
    // check whether user has permissions to delete the item
    const ownsAssignment = assignment.author.id === ctx.request.userId;
    const hasPermissions = ctx.request.user.permissions.some(permission =>
      ['ADMIN'].includes(permission)
    );
    if (!ownsAssignment && !hasPermissions) {
      throw new Error(`You don't have permission to do that!`);
    }

    // delete it
    return ctx.db.mutation.deleteAssignment({ where }, info);
  },
};

module.exports = assignmentMutations;
