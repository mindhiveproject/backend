const slugify = require('slugify');

const makeSlug = title =>
  slugify(title, {
    replacement: '-', // replace spaces with replacement character, defaults to `-`
    remove: /[^a-zA-Z\d\s:]/g, // remove characters that match regex, defaults to `undefined`
    lower: true, // convert to lower case, defaults to `false`
  });

const tagMutations = {
  // create new tag
  async createTag(parent, args, ctx, info) {
    // create slug
    args.slug = makeSlug(args.title);
    // create new tag
    const tag = await ctx.db.mutation.createTag(
      {
        data: {
          ...args,
        },
      },
      info
    );
    return tag;
  },

  // update tag
  async updateTag(parent, args, ctx, info) {
    // take a copy of updates
    const updates = { ...args };
    // update slug if there is a new title
    if (args.title) {
      updates.slug = makeSlug(args.title);
    }
    // remove the ID from the updates
    delete updates.id;
    const tag = await ctx.db.mutation.updateTag(
      {
        data: { ...updates },
        where: {
          id: args.id,
        },
      },
      info
    );
    return tag;
  },

  // delete tag
  async deleteTag(parent, args, ctx, info) {
    const where = { id: args.id };
    await ctx.db.mutation.deleteTag({ where }, info);
    return { message: 'You deleted the tag!' };
  },
};

module.exports = tagMutations;
