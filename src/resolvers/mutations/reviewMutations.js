const reviewMutations = {
  async createReview(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do that!');
    }

    const newReview = { ...args };
    delete newReview.studyId;
    delete newReview.proposalId;

    const review = await ctx.db.mutation.createReview(
      {
        data: {
          author: {
            connect: {
              id: ctx.request.userId,
            },
          },
          study: {
            connect: {
              id: args.studyId,
            },
          },
          proposal: {
            connect: {
              id: args.proposalId,
            },
          },
          ...newReview,
        },
      },
      info
    );

    return review;
  },

  // update the // REVIEW:
  updateReview(parent, args, ctx, info) {
    // take a copy of updates
    const updates = { ...args };
    // remove the ID from the updates
    delete updates.id;
    // run the update method
    return ctx.db.mutation.updateReview(
      {
        data: updates,
        where: {
          id: args.id,
        },
      },
      info
    );
  },
};

module.exports = reviewMutations;
