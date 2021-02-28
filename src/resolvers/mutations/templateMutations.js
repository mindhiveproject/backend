const slugify = require('slugify');

const templateMutations = {
  async createTemplate(parent, args, ctx, info) {
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
    const existingTemplate = await ctx.db.query.template(
      {
        where: { slug: args.slug },
      },
      `{ id }`
    );
    if (existingTemplate) {
      throw new Error(
        `The task template name ${args.title} is already taken. Please try to come up with another name.`
      );
    }

    const template = await ctx.db.mutation.createTemplate(
      {
        data: {
          // this is to create a relationship between the template and the author
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
    return template;
  },

  // update the template
  updateTemplate(parent, args, ctx, info) {
    // take a copy of updates
    const updates = { ...args };
    console.log('updates', updates);
    // remove the ID from the updates
    delete updates.id;
    // run the update method
    return ctx.db.mutation.updateTemplate(
      {
        data: updates,
        where: {
          id: args.id,
        },
      },
      info
    );
  },

  // delete template
  async deleteTemplate(parent, args, ctx, info) {
    const where = { id: args.id };
    // find template
    const template = await ctx.db.query.template(
      { where },
      `{ id title author {id} }`
    );
    // check whether user has permissions to delete the item
    // TODO
    const ownsTemplate = template.author.id === ctx.request.userId;
    const hasPermissions = ctx.request.user.permissions.some(permission =>
      ['ADMIN'].includes(permission)
    );
    if (!ownsTemplate && !hasPermissions) {
      throw new Error(`You don't have permission to do that!`);
    }

    // delete it
    return ctx.db.mutation.deleteTemplate({ where }, info);
  },
};

module.exports = templateMutations;
