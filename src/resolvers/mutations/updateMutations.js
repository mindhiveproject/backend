const updateMutations = {
  // create new update
  async createUpdate(parent, args, ctx, info) {
    const { forUsers } = args;
    delete args.forUsers;
    await forUsers.map(async user => {
      await ctx.db.mutation.createUpdate(
        {
          data: {
            user: {
              connect: { id: user },
            },
            ...args,
          },
        },
        info
      );
    });
    return { message: 'You created an update!' };
  },

  // open update
  async openUpdate(parent, args, ctx, info) {
    await ctx.db.mutation.updateUpdate(
      {
        data: { hasOpen: args.hasOpen },
        where: {
          id: args.id,
        },
      },
      info
    );
    return { message: 'You opened the update!' };
  },

  // delete update
  async deleteUpdate(parent, args, ctx, info) {
    const where = { id: args.id };
    const deletedUpdate = await ctx.db.mutation.deleteUpdate({ where }, info);
    return { message: 'You deleted the update!' };
  },
};

module.exports = updateMutations;
