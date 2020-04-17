const parameterMutations = {
  // add a new set of parameters for an experiment

  async createParameter(parent, args, ctx, info) {
    // 1. Make sure that user is signed in
    const { userId } = ctx.request;
    if (!userId) {
      throw new Error(`You are not signed in`);
    }

    // 2. Create a new set of parameters
    return ctx.db.mutation.createParameter(
      {
        data: {
          title: args.title,
          author: {
            connect: { id: userId },
          },
          experiment: {
            connect: { id: args.experimentId },
          },
          data: args.data,
          settings: args.settings,
        },
      },
      info
    );
  },

  // update parameter
  async updateParameter(parent, args, ctx, info) {
    // verify that the user has the right to update the experiment
    const where = { id: args.id };
    const parameter = await ctx.db.query.parameter(
      { where },
      `{ id title author {id} }`
    );
    // check whether user has permissions to delete the parameter
    const ownsParameter = parameter.author.id === ctx.request.userId;
    const hasPermissions = ctx.request.user.permissions.some(permission =>
      ['ADMIN'].includes(permission)
    );
    if (!ownsParameter && !hasPermissions) {
      throw new Error(`You don't have permission to do that!`);
    }

    // take a copy of updates
    const updates = { ...args };
    // remove the ID from the updates
    delete updates.id;
    // run the update method
    return ctx.db.mutation.updateParameter(
      {
        data: updates,
        where: {
          id: args.id,
        },
      },
      info
    );
  },

  // delete parameter (meaning delete a custom experiment)
  async deleteParameter(parent, args, ctx, info) {
    const where = { id: args.id };
    // find experiment
    const parameter = await ctx.db.query.parameter(
      { where },
      `{ id title author {id} }`
    );
    // check whether user has permissions to delete the parameter
    const ownsParameter = parameter.author.id === ctx.request.userId;
    const hasPermissions = ctx.request.user.permissions.some(permission =>
      ['ADMIN'].includes(permission)
    );
    if (!ownsParameter && !hasPermissions) {
      throw new Error(`You don't have permission to do that!`);
    }
    // delete it
    return ctx.db.mutation.deleteParameter({ where }, info);
  },
};

module.exports = parameterMutations;
