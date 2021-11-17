const taskQueries = {
  // return only public studies by default
  tasks(parent, args, ctx, info) {
    return ctx.db.query.tasks(
      {
        where: {
          public: true,
          ...args.where,
        },
        orderBy: 'createdAt_DESC',
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
        orderBy: 'createdAt_DESC',
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

  // get my favorite tasks
  async favoriteTasks(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do that!');
    }

    const profile = await ctx.db.query.profile(
      {
        where: {
          id: ctx.request.userId,
        },
      },
      `{ id favoriteTasks {id} }`
    );

    const tasksId = profile.favoriteTasks.map(task => task.id);

    if (args.selector === 'me') {
      return ctx.db.query.tasks(
        {
          where: {
            id_in: tasksId,
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
          },
        },
        info
      );
    }

    return ctx.db.query.tasks(
      {
        where: {
          id_in: tasksId,
        },
      },
      info
    );
  },
};

module.exports = taskQueries;
