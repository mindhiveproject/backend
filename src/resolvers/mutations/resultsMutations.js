const resultsMutations = {
  // submit a new result from open API
  async submitResultFromAPI(parent, args, ctx, info) {
    console.log('args', args);
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
      `{ id data quantity }`
    );

    const data = await ctx.db.mutation.createData(
      {
        data: {
          content: args.dataString,
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
            dataPolicy: args.dataPolicy,
            payload,
            token,
            incrementalData:
              payload === 'incremental'
                ? {
                    connect: { id: data.id },
                  }
                : null,
            fullData:
              payload === 'full'
                ? {
                    connect: { id: data.id },
                  }
                : null,
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
    // const savedData = result.data;
    // const newData = [...savedData, ...args.data];

    const updatedResult = await ctx.db.mutation.updateResult(
      {
        where: { token },
        data: {
          quantity: result.quantity + 1,
          incrementalData:
            payload === 'incremental'
              ? {
                  connect: { id: data.id },
                }
              : null,
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
    console.log('args', args);

    // update the user email if there is an email
    const profile = await ctx.db.query.profile(
      {
        where: { id: ctx.request.userId },
      },
      `{ id authEmail { id } consentsInfo tasksInfo }`
    );

    if (args.info && args.info.email) {
      const { email } = args.info;
      const updatedAuthEmail = await ctx.db.mutation.updateAuthEmail(
        {
          data: {
            email,
          },
          where: {
            id: profile.authEmail[0].id,
          },
        },
        `{ id email }`
      );
      console.log('updated email auth', updatedAuthEmail);
    }

    if (args.info && args.info.data && args.info.data === 'no') {
      // TODO delete the data from the database
    }

    // update profile
    const taskInformation = {
      ...profile.tasksInfo,
      [args.info.task.id]: args.info.task,
    };

    const consentId = args.info.consent && args.info.consent.id;
    let consentInformation;
    if (consentId) {
      consentInformation = {
        ...profile.consentsInfo,
        [consentId]: {
          consentGiven: args.info.consent.consentGiven,
          saveCoveredConsent: args.info.consent.saveCoveredConsent,
        },
      };
    } else {
      consentInformation = {
        ...profile.consentsInfo,
      };
    }

    // TODO connect the user to the consent
    const updatedProfile = await ctx.db.mutation.updateProfile(
      {
        data: {
          tasksInfo: taskInformation,
          consentsInfo: consentInformation,
          consentGivenFor: consentId
            ? {
                connect: { id: consentId },
              }
            : null,
        },
        where: {
          id: ctx.request.userId,
        },
      },
      `{ id consentGivenFor { id } }`
    );
    console.log('updated profile', updatedProfile);

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
            dataPolicy: args.info.data,
            info: args.info.task,
          },
        },
        `{ id }`
      );
      // delete all incremental data
      const incrementalResult = await ctx.db.query.result(
        {
          where: whereIncr,
        },
        `{ id incrementalData { id } }`
      );
      incrementalResult.incrementalData.map(data =>
        ctx.db.mutation.deleteData({ where: { id: data.id } }, `{ id }`)
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
              dataPolicy: args.info.data,
              info: args.info.task,
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
