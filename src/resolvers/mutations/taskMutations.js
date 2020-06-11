const slugify = require('slugify');

const taskMutations = {
  async createTask(parent, args, ctx, info) {
    // 1. Make sure that user is signed in
    const { userId } = ctx.request;
    if (!userId) {
      throw new Error(`You are not signed in`);
    }

    args.slug = slugify(args.title, {
      replacement: '-', // replace spaces with replacement character, defaults to `-`
      remove: /[^a-zA-Z\d\s:]/g, // remove characters that match regex, defaults to `undefined`
      lower: true, // convert to lower case, defaults to `false`
    });

    // check whether the slug is already in the system
    const existingTask = await ctx.db.query.task(
      {
        where: { slug: args.slug },
      },
      `{ id }`
    );
    if (existingTask) {
      throw new Error(
        `The task name ${args.title} is already taken. Please try to come up with another name.`
      );
    }

    // 2. Create a new set of tasks
    return ctx.db.mutation.createTask(
      {
        data: {
          title: args.title,
          slug: args.slug,
          author: {
            connect: { id: userId },
          },
          template: {
            connect: { id: args.templateId },
          },
          parameters: args.parameters,
          settings: args.settings,
        },
      },
      info
    );
  },

  // update task
  async updateTask(parent, args, ctx, info) {
    // verify that the user has the right to update the template
    const where = { id: args.id };
    const task = await ctx.db.query.task({ where }, `{ id title author {id} }`);
    // check whether user has permissions to delete the task
    const ownsTask = task.author.id === ctx.request.userId;
    const hasPermissions = ctx.request.user.permissions.some(permission =>
      ['ADMIN'].includes(permission)
    );
    if (!ownsTask && !hasPermissions) {
      throw new Error(`You don't have permission to do that!`);
    }

    // take a copy of updates
    const updates = { ...args };
    // remove the ID from the updates
    delete updates.id;
    // run the update method
    return ctx.db.mutation.updateTask(
      {
        data: updates,
        where: {
          id: args.id,
        },
      },
      info
    );
  },

  // delete task (meaning delete a custom experiment)
  async deleteTask(parent, args, ctx, info) {
    const where = { id: args.id };
    // find experiment
    const task = await ctx.db.query.task({ where }, `{ id title author {id} }`);
    // check whether user has permissions to delete the task
    const ownsTask = task.author.id === ctx.request.userId;
    const hasPermissions = ctx.request.user.permissions.some(permission =>
      ['ADMIN'].includes(permission)
    );
    if (!ownsTask && !hasPermissions) {
      throw new Error(`You don't have permission to do that!`);
    }
    // delete it
    return ctx.db.mutation.deleteTask({ where }, info);
  },
};

module.exports = taskMutations;
