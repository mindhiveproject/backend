const resultsMutations = {
  // submit a new result from open API
  async submitResultFromAPI(parent, args, ctx, info) {
    const messageId = args.metadata && args.metadata.id;
    const payload = args.metadata && args.metadata.payload;
    const token = `${payload.slice(0, 4)}-${messageId}`;

    // console.log('args.studyId', args.studyId);
    const result = await ctx.db.query.result(
      {
        where: {
          token,
        },
      },
      `{ id }`
    );

    if (!result) {
      const createdResult = await ctx.db.mutation.createResult(
        {
          data: {
            user: {
              connect: { id: args.userId },
            },
            template: args.templateId
              ? {
                  connect: { id: args.templateId },
                }
              : null,
            task: args.taskId
              ? {
                  connect: { id: args.taskId },
                }
              : null,
            study: args.studyId
              ? {
                  connect: { id: args.studyId },
                }
              : null,
            quantity: 1,
            data: args.data,
            dataPolicy: args.dataPolicy,
            payload,
            token,
          },
        },
        `{ id }`
      );
      // delete incremental data if payload is full
      // if (payload === 'full') {
      //   const tokenToDelete = `incr-${messageId}`;
      //   console.log('tokenToDelete', tokenToDelete);
      //   const where = { token: tokenToDelete };
      //   await ctx.db.mutation.deleteResult({ where }, info);
      // }
      return { message: 'Created' };
    }
    const savedData = result.data;
    const newData = [...savedData, ...args.data];

    const updatedResult = await ctx.db.mutation.updateResult(
      {
        where: { token },
        data: {
          data: newData,
          quantity: result.quantity + 1,
        },
      },
      `{ id }`
    );

    return { message: 'Updated' };
  },

  // delete result
  async deleteResult(parent, args, ctx, info) {
    const where = { id: args.id };
    // find result
    const result = await ctx.db.query.result({ where }, `{ id user {id} }`);
    // check whether user has permissions to delete the item or it is the result of this user
    const ownsResult = result.user.id === ctx.request.userId;
    const hasPermissions = ctx.request.user.permissions.some(permission =>
      ['ADMIN'].includes(permission)
    );
    if (!ownsResult && !hasPermissions) {
      throw new Error(`You don't have permission to do that!`);
    }
    // delete it
    return ctx.db.mutation.deleteResult({ where }, info);
  },

  // update the information about results
  async updateResultsInfo(parent, args, ctx, info) {
    // console.log('args', args);
    const whereFull = { token: `full-${args.id}` };
    const whereIncr = { token: `incr-${args.id}` };
    const hasPermissions = ctx.request.user.permissions.some(permission =>
      ['ADMIN'].includes(permission)
    );

    // 1. find full result, check ownership and update the info on it, delete incremental result
    const fullResult = await ctx.db.query.result(
      {
        where: whereFull,
      },
      `{ id user {id} }`
    );
    if (fullResult) {
      const ownsFullResult = fullResult.user.id === ctx.request.userId;
      if (!ownsFullResult && !hasPermissions) {
        throw new Error(`You don't have permission to do that!`);
      }
      await ctx.db.mutation.updateResult(
        {
          where: whereFull,
          data: {
            info: args.info,
          },
        },
        `{ id }`
      );
      await ctx.db.mutation.deleteResult({ where: whereIncr }, info);
    }

    // 2. if there is no full result, find incremental results, check ownership and update info on it
    if (!fullResult) {
      const incrResult = await ctx.db.query.result(
        {
          where: whereIncr,
        },
        `{ id user {id} }`
      );
      if (incrResult) {
        const ownsIncrResult = incrResult.user.id === ctx.request.userId;
        if (!ownsIncrResult && !hasPermissions) {
          throw new Error(`You don't have permission to do that!`);
        }
        await ctx.db.mutation.updateResult(
          {
            where: whereIncr,
            data: {
              info: args.info,
            },
          },
          `{ id }`
        );
      }
    }

    return { message: 'Updated' };
  },
};

module.exports = resultsMutations;
