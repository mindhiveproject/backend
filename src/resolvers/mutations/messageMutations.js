const messageMutations = {
  async createMessage(parent, args, ctx, info) {
    // console.log('args', args);

    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do that!');
    }

    const message = await ctx.db.mutation.createMessage(
      {
        data: {
          author: {
            connect: {
              id: ctx.request.userId,
            },
          },
          ...args,
        },
      },
      info
    );

    // console.log('new message created', message);
    const { id } = args.settings.origin;

    // connect a study/task/class instance with the message
    switch (args.settings.origin.type) {
      case 'Study':
        await ctx.db.mutation.updateStudy(
          {
            data: {
              messages: {
                connect: { id: message.id },
              },
            },
            where: {
              id,
            },
          },
          `{ id }`
        );
        break;
      default:
        console.log('Unknown type');
    }

    return message;
  },

  // update the message
  updateMessage(parent, args, ctx, info) {
    // take a copy of updates
    const updates = { ...args };
    // remove the ID from the updates
    delete updates.id;
    // run the update method
    return ctx.db.mutation.updateMessage(
      {
        data: updates,
        where: {
          id: args.id,
        },
      },
      info
    );
  },

  // delete message
  async deleteMessage(parent, args, ctx, info) {
    const where = { id: args.id };
    // find message
    const message = await ctx.db.query.message({ where }, `{ id author {id} }`);
    // check whether user has permissions to delete the item
    // TODO
    const ownsMessage = message.author.id === ctx.request.userId;
    const hasPermissions = ctx.request.user.permissions.some(permission =>
      ['ADMIN'].includes(permission)
    );
    if (!ownsMessage && !hasPermissions) {
      throw new Error(`You don't have permission to do that!`);
    }

    // delete it
    return ctx.db.mutation.deleteMessage({ where }, info);
  },
};

module.exports = messageMutations;
