const slugify = require('slugify');

const taskMutations = {
  async createTask(parent, args, ctx, info) {
    // 1. Make sure that user is signed in
    const { userId } = ctx.request;
    if (!userId) {
      throw new Error(`You are not signed in`);
    }

    if (!args.slug) {
      args.slug = slugify(args.title, {
        replacement: '-', // replace spaces with replacement character, defaults to `-`
        remove: /[^a-zA-Z\d\s:]/g, // remove characters that match regex, defaults to `undefined`
        lower: true, // convert to lower case, defaults to `false`
      });
    }

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

    let collaborators = [];
    if (args.collaborators && args.collaborators.length) {
      collaborators = await Promise.all(
        args.collaborators.map(username =>
          ctx.db.query.profile({ where: { username } }, `{ id }`)
        )
      );
      collaborators = collaborators.filter(c => c);
    }

    // 2. Create a new set of tasks
    return ctx.db.mutation.createTask(
      {
        data: {
          title: args.title,
          slug: args.slug,
          description: args.description,
          author: {
            connect: { id: userId },
          },
          template: args.templateId
            ? {
                connect: { id: args.templateId },
              }
            : null,
          parameters: args.parameters,
          settings: args.settings,
          link: args.link,
          collaborators: {
            connect: collaborators,
          },
          consent:
            args.consent && args.consent !== 'no'
              ? {
                  connect: { id: args.consent },
                }
              : null,
          taskType: args.taskType,
          submitForPublishing: args.submitForPublishing,
        },
      },
      info
    );
  },

  // update task
  async updateTask(parent, args, ctx, info) {
    // verify that the user has the right to update the template
    const where = { id: args.id };
    const preTask = await ctx.db.query.task(
      { where },
      `{ id title author {id} collaborators {id} }`
    );
    // check whether user has permissions to delete the task
    const ownsTask = preTask.author.id === ctx.request.userId;
    const hasPermissions = ctx.request.user.permissions.some(permission =>
      ['ADMIN'].includes(permission)
    );
    const isCollaborator = preTask.collaborators
      .map(collaborator => collaborator.id)
      .includes(ctx.request.userId);
    // console.log('isCollaborator', isCollaborator);
    if (!ownsTask && !hasPermissions && !isCollaborator) {
      throw new Error(`You don't have permission to do that!`);
    }

    let collaborators = [];
    if (args.collaborators && args.collaborators.length) {
      collaborators = await Promise.all(
        args.collaborators.map(username =>
          ctx.db.query.profile({ where: { username } }, `{ id }`)
        )
      );
      args.collaborators = [];
      collaborators = collaborators.filter(c => c);
    }

    const task = await ctx.db.query.task(
      {
        where: { id: args.id },
      },
      `{ id collaborators { id } consent { id } }`
    );

    if (
      collaborators &&
      task.collaborators &&
      collaborators.length !== task.collaborators.length
    ) {
      // remove previous connections
      await ctx.db.mutation.updateTask(
        {
          data: {
            collaborators: {
              disconnect: task.collaborators,
            },
          },
          where: {
            id: args.id,
          },
        },
        `{ id }`
      );
    }

    // take a copy of updates
    const updates = { ...args };
    // remove the ID from the updates
    delete updates.id;
    // run the update method
    return ctx.db.mutation.updateTask(
      {
        data: {
          ...updates,
          collaborators: {
            connect: collaborators,
          },
          consent: args.consent
            ? args.consent === 'no'
              ? {
                  disconnect: { id: task.consent.id },
                }
              : {
                  connect: { id: args.consent },
                }
            : null,
        },
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
    const task = await ctx.db.query.task(
      { where },
      `{ id title author {id} collaborators {id} }`
    );
    // check whether user has permissions to delete the task
    const ownsTask = task.author.id === ctx.request.userId;
    const isCollaborator = task.collaborators
      .map(collaborator => collaborator.id)
      .includes(ctx.request.userId);
    const hasPermissions = ctx.request.user.permissions.some(permission =>
      ['ADMIN'].includes(permission)
    );
    if (!ownsTask && !hasPermissions && !isCollaborator) {
      throw new Error(`You don't have permission to do that!`);
    }
    // delete it
    return ctx.db.mutation.deleteTask({ where }, info);
  },

  async publishTaskToggle(parent, args, ctx, info) {
    // check the status of the task
    const task = await ctx.db.query.task(
      {
        where: { id: args.id },
      },
      `{ id public }`
    );
    if (!task) {
      throw new Error(`No task found.`);
    }

    // update the task with the opposite to current value
    return ctx.db.mutation.updateTask(
      {
        data: {
          public: !task.public,
        },
        where: { id: args.id },
      },
      info
    );
  },
};

module.exports = taskMutations;
