const uniqid = require('uniqid');

const scriptMutations = {
  // create new script
  async createScript(parent, args, ctx, info) {
    // create slug
    args.slug = uniqid();
    // create new script
    const script = await ctx.db.mutation.createScript(
      {
        data: {
          creator: {
            connect: {
              id: ctx.request.userId,
            },
          },
          ...args,
        },
      },
      info
    );
    return script;
  },

  // copy script
  async copyScript(parent, args, ctx, info) {
    // find a script script with this id
    const where = { id: args.id };
    const template = await ctx.db.query.script(
      { where },
      `{ id title description content }`
    );

    // make a full copy
    const argumentsToCopy = {
      title: template.title,
      description: template.description,
      content: template.content,
      slug: uniqid(),
    };
    // create a new script
    const script = await ctx.db.mutation.createScript(
      {
        data: {
          author: {
            connect: {
              id: ctx.request.userId,
            },
          },
          ...argumentsToCopy,
        },
      },
      info
    );

    return script;
  },

  async updateScript(parent, args, ctx, info) {
    // take a copy of updates
    const updates = { ...args };
    // remove the ID from the updates
    delete updates.id;
    const script = await ctx.db.mutation.updateScript(
      {
        data: { ...updates },
        where: {
          id: args.id,
        },
      },
      info
    );
    return script;
  },

  // delete script
  async deleteScript(parent, args, ctx, info) {
    const where = { id: args.id };
    return ctx.db.mutation.deleteScript({ where }, info);
  },
};

module.exports = scriptMutations;
