const classNetworkMutations = {
  async createClassNetwork(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do that!');
    }

    const network = { ...args };
    delete network.classes;
    const classes = args.classes.map(theclass => ({ id: theclass }));

    const classNetwork = await ctx.db.mutation.createClassNetwork(
      {
        data: {
          creator: {
            connect: {
              id: ctx.request.userId,
            },
          },
          classes: {
            connect: classes,
          },
          ...network,
        },
      },
      info
    );

    return classNetwork;
  },

  // update
  updateClassNetwork(parent, args, ctx, info) {
    // take a copy of updates
    const updates = { ...args };
    // remove the ID from the updates
    delete updates.id;
    // run the update method
    return ctx.db.mutation.updateClassNetwork(
      {
        data: updates,
        where: {
          id: args.id,
        },
      },
      info
    );
  },
};

module.exports = classNetworkMutations;
