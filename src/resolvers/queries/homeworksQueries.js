const homeworksQueries = {
  // return only my homeworks for specific assignment
  myHomeworks(parent, args, ctx, info) {
    // check if the user has permission to see all users
    if (!ctx.request.userId) {
      throw new Error('You must be logged in');
    }
    // query parameters where author is the current user
    return ctx.db.query.homeworks(
      {
        where: {
          author: {
            id: ctx.request.userId,
          },
          ...args.where,
        },
        orderBy: 'createdAt_ASC',
      },
      info
    );
  },
};

module.exports = homeworksQueries;
