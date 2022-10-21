const userMutations = {
  // update a user account by admin
  async updateUserAccount(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do that!');
    }

    // check whether it is an admin
    const hasPermissions = ctx.request.user.permissions.some(permission =>
      ['ADMIN'].includes(permission)
    );
    if (!hasPermissions) {
      throw new Error(`You don't have permission to do that!`);
    }

    // update user profile
    const updatedProfile = await ctx.db.mutation.updateProfile(
      {
        data: {
          permissions: {
            set: args.permissions,
          },
        },
        where: {
          id: args.id,
        },
      },
      info
    );

    return updatedProfile;
  },
};

module.exports = userMutations;
