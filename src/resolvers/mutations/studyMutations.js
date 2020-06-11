const slugify = require('slugify');

const studyMutations = {
  async createStudy(parent, args, ctx, info) {
    // Check login
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do that!');
    }

    args.slug = slugify(args.title, {
      replacement: '-', // replace spaces with replacement character, defaults to `-`
      remove: /[^a-zA-Z\d\s:]/g, // remove characters that match regex, defaults to `undefined`
      lower: true, // convert to lower case, defaults to `false`
    });

    // check whether the slug is already in the system
    const existingStudy = await ctx.db.query.study(
      {
        where: { slug: args.slug },
      },
      `{ id }`
    );
    if (existingStudy) {
      throw new Error(
        `The study name ${args.title} is already taken. Please try to come up with another name.`
      );
    }

    const study = await ctx.db.mutation.createStudy(
      {
        data: {
          // this is to create a relationship between the study and the author
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
    return study;
  },

  // update the study
  updateStudy(parent, args, ctx, info) {
    // take a copy of updates
    const updates = { ...args };
    // remove the ID from the updates
    delete updates.id;
    // run the update method
    return ctx.db.mutation.updateStudy(
      {
        data: updates,
        where: {
          id: args.id,
        },
      },
      info
    );
  },

  // delete study
  async deleteStudy(parent, args, ctx, info) {
    const where = { id: args.id };
    // find study
    const study = await ctx.db.query.study(
      { where },
      `{ id title author {id} }`
    );
    // check whether user has permissions to delete the item
    // TODO
    const ownsStudy = study.author.id === ctx.request.userId;
    const hasPermissions = ctx.request.user.permissions.some(permission =>
      ['ADMIN'].includes(permission)
    );
    if (!ownsStudy && !hasPermissions) {
      throw new Error(`You don't have permission to do that!`);
    }

    // delete it
    return ctx.db.mutation.deleteStudy({ where }, info);
  },

  // update the study
  async buildStudy(parent, args, ctx, info) {
    const { tasks } = args;
    console.log('tasks', tasks);
    // const tasks = args.tasks.map(task => ({ id: task }));
    //
    // const study = await ctx.db.query.study(
    //   {
    //     where: { id: args.id },
    //   },
    //   `{ id tasks { id } }`
    // );
    // // remove previous connections
    // await ctx.db.mutation.updateStudy(
    //   {
    //     data: {
    //       tasks: {
    //         disconnect: study.tasks,
    //       },
    //     },
    //     where: {
    //       id: args.id,
    //     },
    //   },
    //   `{ id }`
    // );
    // run the update method
    return ctx.db.mutation.updateStudy(
      {
        data: {
          tasks,
        },
        where: {
          id: args.id,
        },
      },
      info
    );
  },
};

module.exports = studyMutations;
