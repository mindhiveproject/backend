const taskQueries = {
  // return only public studies by default
  tasks(parent, args, ctx, info) {
    return ctx.db.query.tasks(
      {
        where: {
          public: true,
          ...args.where,
        },
      },
      info
    );
  },

  // get only tasks of the user
  async myTasks(parent, args, ctx, info) {
    // check if the user has permission to see all users
    if (!ctx.request.userId) {
      throw new Error('You must be logged in');
    }

    // query parameters where author is the current user
    return ctx.db.query.tasks(
      {
        where: {
          OR: [
            {
              author: {
                id: ctx.request.userId,
              },
            },
            {
              collaborators_some: {
                id: ctx.request.userId,
              },
            },
          ],
          ...args.where,
        },
      },
      info
    );
  },

  // get only tasks of the user
  async myAndAllTasks(parent, args, ctx, info) {
    // check if the user has permission to see all users
    if (!ctx.request.userId) {
      throw new Error('You must be logged in');
    }

    // query parameters where author is the current user
    return ctx.db.query.tasks(
      {
        where: {
          OR: [
            {
              public: true,
            },
            {
              author: {
                id: ctx.request.userId,
              },
            },
            {
              collaborators_some: {
                id: ctx.request.userId,
              },
            },
          ],
          ...args.where,
        },
      },
      info
    );
  },

  // get all studies for admin
  async allStudies(parent, args, ctx, info) {
    const studies = await ctx.db.query.studies({}, info);
    return studies;
  },

  // get all tasks
  async allTasks(parent, args, ctx, info) {
    // check if the user has permission to see all users
    if (!ctx.request.userId) {
      throw new Error('You must be logged in');
    }

    // query parameters where author is the current user
    return ctx.db.query.tasks(
      {
        where: {
          ...args.where,
        },
      },
      info
    );
  },
};

module.exports = taskQueries;
