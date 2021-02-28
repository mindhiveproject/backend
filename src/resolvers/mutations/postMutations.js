const postMutations = {
  // create post
  async createPost(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do that!');
    }

    const newPost = { ...args };
    delete newPost.journal;

    const post = await ctx.db.mutation.createPost(
      {
        data: {
          author: {
            connect: {
              id: ctx.request.userId,
            },
          },
          journal: {
            connect: {
              id: args.journal,
            },
          },
          ...newPost,
        },
      },
      info
    );

    return post;
  },

  // update the post
  updatePost(parent, args, ctx, info) {
    // take a copy of updates
    const updates = { ...args };
    // remove the ID from the updates
    delete updates.id;
    // run the update method
    return ctx.db.mutation.updatePost(
      {
        data: updates,
        where: {
          id: args.id,
        },
      },
      info
    );
  },

  // delete post
  async deletePost(parent, args, ctx, info) {
    const where = { id: args.id };
    // find post
    const post = await ctx.db.query.post({ where }, `{ id author {id} }`);
    // check whether user has permissions to delete the item
    const ownsPost = post.author.id === ctx.request.userId;
    const hasPermissions = ctx.request.user.permissions.some(permission =>
      ['ADMIN'].includes(permission)
    );
    if (!ownsPost && !hasPermissions) {
      throw new Error(`You don't have permission to do that!`);
    }

    // delete it
    return ctx.db.mutation.deletePost({ where }, info);
  },
};

module.exports = postMutations;
