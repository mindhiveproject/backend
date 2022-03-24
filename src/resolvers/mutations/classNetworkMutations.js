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
  async updateClassNetwork(parent, args, ctx, info) {
    // Check login
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do that!');
    }
    // take a copy of updates
    const updates = { ...args };
    // remove the ID and classes from the updates
    delete updates.id;
    delete updates.classes;

    // find network and remove classes
    const network = await ctx.db.query.classNetwork(
      {
        where: { id: args.id },
      },
      `{ id classes { id } }`
    );

    await ctx.db.mutation.updateClassNetwork(
      {
        data: {
          classes: {
            disconnect: network.classes,
          },
        },
        where: {
          id: args.id,
        },
      },
      `{ id }`
    );

    const classes = args.classes.map(theclass => ({ id: theclass }));
    // run the update method
    return ctx.db.mutation.updateClassNetwork(
      {
        data: { ...updates, classes: { connect: classes } },
        where: {
          id: args.id,
        },
      },
      info
    );
  },
};

module.exports = classNetworkMutations;
