const resultsMutations = {
  // submit a new result from open API
  async submitResultFromAPI(parent, args, ctx, info) {
    // console.log('args', args);
    const messageId = args.metadata && args.metadata.id;
    const payload = args.metadata && args.metadata.payload;
    const token = `${payload.slice(0, 4)}-${messageId}`;

    // console.log('args.studyId', args.studyId);
    const result = await ctx.db.query.result({
      where: {
        token,
      },
    });

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

  // // add a new result of the experiment
  // async addResult(parent, args, ctx, info) {
  //   // 1. Make sure that user is signed in
  //   const { userId } = ctx.request;
  //   if (!userId) {
  //     throw new Error(`You are not signed in`);
  //   }
  //   // 2. Query the user current results
  //   // const [existingResults] = await ctx.db.query.results({
  //   //   where: {
  //   //     user: { id: userId },
  //   //     experiment: { id: args.experimentId },
  //   //   },
  //   // });
  //   // console.log('data', args.data);
  //   // // if there are existing results
  //   // if (existingResults) {
  //   //   console.log('there are already results');
  //   //   return ctx.db.mutation.updateResult(
  //   //     {
  //   //       where: { id: existingResults.id },
  //   //       data: { quantity: existingResults.quantity + 1, data: args.data },
  //   //     },
  //   //     info
  //   //   );
  //   // }
  //   // if there are no existing results
  //   return ctx.db.mutation.createResult(
  //     {
  //       data: {
  //         user: {
  //           connect: { id: userId },
  //         },
  //         experiment: {
  //           connect: { id: args.experimentId },
  //         },
  //         quantity: 1,
  //         data: args.data,
  //         dataPolicy: args.dataPolicy,
  //       },
  //     },
  //     info
  //   );
  // },

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
};

module.exports = resultsMutations;
