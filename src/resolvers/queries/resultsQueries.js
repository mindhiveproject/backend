const resultsQueries = {
  // get the results of the particular class (all students in this class)
  async myClassResults(parent, args, ctx, info) {
    // 1. check if the user has permission to see the class (Teacher of this class) or Admin
    const { where } = args;
    const myclass = await ctx.db.query.class(
      { where },
      `{ id title creator {id} }`
    );
    const ownsClass = myclass.creator.id === ctx.request.userId;
    const hasPermissions = ctx.request.user.permissions.some(permission =>
      ['ADMIN', 'TEACHER'].includes(permission)
    );
    if (!ownsClass && !hasPermissions) {
      throw new Error(`You don't have permission to do that!`);
    }

    // 2. query all students of the class
    const myStudents = await ctx.db.query.profiles(
      {
        where: {
          studentIn_some: {
            id: args.where.id,
          },
        },
      },
      `{ id }`
    );
    console.log('myStudents', myStudents);

    // 3. query all results of these students
    return ctx.db.query.results(
      {
        where: {
          user: {
            id_in: myStudents.map(student => student.id),
          },
        },
      },
      info
    );
  },

  // study results
  async myStudyResults(parent, args, ctx, info) {
    // 1. check if the user has permission to see the class (Teacher of this class) or Admin
    const { where } = args;
    const mystudy = await ctx.db.query.study(
      { where },
      `{ id title author {id} collaborators {id}}`
    );
    const ownsStudy = mystudy.author.id === ctx.request.userId;
    const hasPermissions = ctx.request.user.permissions.some(permission =>
      ['ADMIN', 'TEACHER', 'SCIENTIST'].includes(permission)
    );
    let collaboratorInStudy;
    if (mystudy.collaborators) {
      const collaboratorsIds = mystudy.collaborators.map(
        collaborator => collaborator.id
      );
      collaboratorInStudy = collaboratorsIds.includes(ctx.request.userId);
    }

    if (!ownsStudy && !hasPermissions && !collaboratorInStudy) {
      throw new Error(`You don't have permission to do that!`);
    }

    // 2. query all results of the study
    const results = await ctx.db.query.results(
      {
        where: {
          study: {
            id: mystudy.id,
          },
        },
      },
      info
    );

    return results;
  },

  // task results
  async myTaskResults(parent, args, ctx, info) {
    // 1. check if the user has permission to see the test results (owns this test of a collaborator) or Admin
    const { where } = args;
    const mytask = await ctx.db.query.task(
      { where },
      `{ id title author {id} collaborators {id}}`
    );
    const ownsTask = mytask.author.id === ctx.request.userId;
    const hasPermissions = ctx.request.user.permissions.some(permission =>
      ['ADMIN'].includes(permission)
    );
    let collaboratorInTask;
    if (mytask.collaborators) {
      const collaboratorsIds = mytask.collaborators.map(
        collaborator => collaborator.id
      );
      collaboratorInTask = collaboratorsIds.includes(ctx.request.userId);
    }

    if (!ownsTask && !hasPermissions && !collaboratorInTask) {
      throw new Error(`You don't have permission to do that!`);
    }

    // 2. query all results of the task
    return ctx.db.query.results(
      {
        where: {
          task: {
            id: mytask.id,
          },
        },
      },
      info
    );
  },
};

module.exports = resultsQueries;
