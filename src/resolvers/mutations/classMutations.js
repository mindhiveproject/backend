const slugify = require('slugify');

const classMutations = {
  // create new class
  async createClass(parent, args, ctx, info) {
    console.log('args', args);
    // TODO: Check login
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do that!');
    }
    args.code = slugify(args.title).toLowerCase();

    const schoolclass = await ctx.db.mutation.createClass(
      {
        data: {
          // this is to create a relationship between the class and the creator
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

    return schoolclass;
  },

  // join class for students
  async joinClass(parent, args, ctx, info) {
    // Check login
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do that!');
    }
    // connect user and the class
    const updatedProfile = await ctx.db.mutation.updateProfile(
      {
        data: {
          studentIn: {
            connect: {
              id: args.id,
            },
          },
        },
        where: {
          id: ctx.request.userId,
        },
      },
      `{ id username permissions }`
    );
    // console.log('updateProfile', updatedProfile);

    return { message: 'You joined the class!' };
  },

  // leave class for students
  async leaveClass(parent, args, ctx, info) {
    // Check login
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do that!');
    }
    // disconnect user and the class
    const updatedProfile = await ctx.db.mutation.updateProfile(
      {
        data: {
          studentIn: {
            disconnect: {
              id: args.id,
            },
          },
        },
        where: {
          id: ctx.request.userId,
        },
      },
      `{ id username permissions }`
    );
    // console.log('updateProfile', updatedProfile);

    return { message: 'You left the class!' };
  },

  // update the class
  async updateClass(parent, args, ctx, info) {
    const where = { id: args.id };
    // find class
    const myclass = await ctx.db.query.class(
      { where },
      `{ id title creator {id} }`
    );
    // check whether user has permissions to edit the class
    const ownsClass = myclass.creator.id === ctx.request.userId;
    const hasPermissions = ctx.request.user.permissions.some(permission =>
      ['ADMIN'].includes(permission)
    );
    if (!ownsClass && !hasPermissions) {
      throw new Error(`You don't have permission to do that!`);
    }

    // take a copy of updates
    const updates = { ...args };
    // remove the ID from the updates
    delete updates.id;
    // run the update method
    return ctx.db.mutation.updateClass(
      {
        data: updates,
        where: {
          id: args.id,
        },
      },
      info
    );
  },

  // delete class
  async deleteClass(parent, args, ctx, info) {
    const where = { id: args.id };
    // find class
    const myclass = await ctx.db.query.class(
      { where },
      `{ id title creator {id} }`
    );
    // check whether user has permissions to delete the item
    const ownsClass = myclass.creator.id === ctx.request.userId;
    const hasPermissions = ctx.request.user.permissions.some(permission =>
      ['ADMIN'].includes(permission)
    );
    if (!ownsClass && !hasPermissions) {
      throw new Error(`You don't have permission to do that!`);
    }

    // delete it
    return ctx.db.mutation.deleteClass({ where }, info);
  },

  // expel a student from class (for teachers)
  async expelFromClass(parent, args, ctx, info) {
    // Check login
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do that!');
    }
    // disconnect user and the class
    const updatedProfile = await ctx.db.mutation.updateProfile(
      {
        data: {
          studentIn: {
            disconnect: {
              id: args.classId,
            },
          },
        },
        where: {
          id: args.studentId,
        },
      },
      `{ id username permissions }`
    );

    return { message: 'You expelled the student!' };
  },

  // move a student to a different class (for teachers)
  async moveToClass(parent, args, ctx, info) {
    // Check login
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do that!');
    }
    // disconnect user and the class
    const updatedProfile = await ctx.db.mutation.updateProfile(
      {
        data: {
          studentIn: {
            connect: {
              id: args.classId,
            },
          },
        },
        where: {
          id: args.studentId,
        },
      },
      `{ id username permissions }`
    );

    return { message: 'You assigned the student to a new class!' };
  },
};

module.exports = classMutations;
