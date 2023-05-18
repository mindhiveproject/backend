const slugify = require("slugify");

const studyMutations = {
  async createStudy(parent, args, ctx, info) {
    // Check login
    if (!ctx.request.userId) {
      throw new Error("You must be logged in to do that!");
    }

    args.slug = slugify(args.title, {
      replacement: "-", // replace spaces with replacement character, defaults to `-`
      remove: /[^a-zA-Z\d\s:]/g, // remove characters that match regex, defaults to `undefined`
      lower: true, // convert to lower case, defaults to `false`
    });

    // check whether the slug is already in the system
    const existingStudy = await ctx.db.query.study(
      {
        where: { slug: args.slug },
      },
      `{ id }`
    );
    if (existingStudy) {
      throw new Error(
        `Oops! This study name ${args.title} has already been taken: please pick another.`
      );
    }

    let collaborators = [];
    if (args.collaborators && args.collaborators.length) {
      collaborators = await Promise.all(
        args.collaborators.map((username) =>
          ctx.db.query.profile({ where: { username } }, `{ id }`)
        )
      );
      args.collaborators = [];
      collaborators = collaborators.filter((c) => c);
    }

    // take a copy of updates
    const updates = { ...args };
    // remove variables from the updates
    delete updates.collaborators;
    delete updates.consentId;
    delete updates.classes;
    delete updates.tags;
    delete updates.descriptionInProposalCardId;

    const study = await ctx.db.mutation.createStudy(
      {
        data: {
          // this is to create a relationship between the study and the author
          author: {
            connect: {
              id: ctx.request.userId,
            },
          },
          collaborators: {
            connect: collaborators,
          },
          consent:
            args.consentId && args.consentId.length
              ? {
                  connect: args.consentId.map((id) => ({ id })),
                }
              : null,
          classes:
            args.classes && args.classes.length
              ? {
                  connect: args.classes.map((cl) => ({ id: cl })),
                }
              : null,
          tags:
            args.tags && args.tags.length
              ? {
                  connect: args.tags.map((tag) => ({ id: tag })),
                }
              : null,
          descriptionInProposalCard: args.descriptionInProposalCardId
            ? {
                connect: { id: args.descriptionInProposalCardId },
              }
            : null,
          ...updates,
        },
      },
      info
    );
    return study;
  },

  // update the study
  async updateStudy(parent, args, ctx, info) {
    let collaborators = [];
    if (args.collaborators && args.collaborators.length) {
      collaborators = await Promise.all(
        args.collaborators.map((username) =>
          ctx.db.query.profile({ where: { username } }, `{ id }`)
        )
      );
      args.collaborators = [];
      collaborators = collaborators.filter((c) => c);
    }

    const study = await ctx.db.query.study(
      {
        where: { id: args.id },
      },
      `{ id collaborators { id } consent { id } classes { id } tags { id } }`
    );

    // disconnect the current collaborators if needed
    if (
      collaborators &&
      study.collaborators &&
      collaborators.length !== study.collaborators.length
    ) {
      // remove previous connections
      await ctx.db.mutation.updateStudy(
        {
          data: {
            collaborators: {
              disconnect: study.collaborators,
            },
          },
          where: {
            id: args.id,
          },
        },
        `{ id }`
      );
    }

    // disconnect the current consents if needed
    if (
      args.consentId &&
      study.consent &&
      args.consentId.length !== study.consent.length
    ) {
      // remove previous connections
      await ctx.db.mutation.updateStudy(
        {
          data: {
            consent: {
              disconnect: study.consent,
            },
          },
          where: {
            id: args.id,
          },
        },
        `{ id }`
      );
    }

    // disconnect the current classes and current tags
    await ctx.db.mutation.updateStudy(
      {
        data: {
          classes: {
            disconnect: study.classes,
          },
          tags: {
            disconnect: study.tags,
          },
        },
        where: {
          id: args.id,
        },
      },
      `{ id }`
    );

    // take a copy of updates
    const updates = { ...args };
    // remove variables from the updates
    delete updates.id;
    delete updates.collaborators;
    delete updates.consentId;
    delete updates.classes;
    delete updates.tags;
    delete updates.descriptionInProposalCardId;

    // validate slug
    updates.slug = slugify(args.slug, {
      replacement: "-", // replace spaces with replacement character, defaults to `-`
      remove: /[^a-zA-Z\d\s:]/g, // remove characters that match regex, defaults to `undefined`
      lower: true, // convert to lower case, defaults to `false`
    });

    // run the update method
    return ctx.db.mutation.updateStudy(
      {
        data: {
          ...updates,
          collaborators: {
            connect: collaborators,
          },
          consent:
            args.consentId && args.consentId.length
              ? {
                  connect: args.consentId.map((id) => ({ id })),
                }
              : null,
          classes:
            args.classes && args.classes.length
              ? {
                  connect: args.classes.map((cl) => ({ id: cl })),
                }
              : null,
          tags:
            args.tags && args.tags.length
              ? {
                  connect: args.tags.map((tag) => ({ id: tag })),
                }
              : null,
          descriptionInProposalCard: args.descriptionInProposalCardId
            ? {
                connect: { id: args.descriptionInProposalCardId },
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

  async manageStudyVisibility(parent, args, ctx, info) {
    const updates = { ...args };
    delete updates.id;

    // update the study with the opposite to current value
    return ctx.db.mutation.updateStudy(
      {
        data: {
          ...updates,
        },
        where: { id: args.id },
      },
      info
    );
  },

  // "pre-delete" study (which makes the study invisible for a user, but not to an admin)
  async preDeleteStudy(parent, args, ctx, info) {
    const where = { id: args.id };
    // find study
    const study = await ctx.db.query.study(
      { where },
      `{ id title author {id} collaborators {id} }`
    );
    // check whether user has permissions to hide the item
    // TODO
    const ownsStudy = study.author.id === ctx.request.userId;
    const hasPermissions = ctx.request.user.permissions.some((permission) =>
      ["ADMIN"].includes(permission)
    );
    const isCollaborator = study.collaborators
      .map((collaborator) => collaborator.id)
      .includes(ctx.request.userId);
    if (!ownsStudy && !hasPermissions && !isCollaborator) {
      throw new Error(`You don't have permission to do that!`);
    }
    // hide it
    return ctx.db.mutation.updateStudy(
      { where, data: { isHidden: true } },
      info
    );
  },

  // delete study
  async deleteStudy(parent, args, ctx, info) {
    const where = { id: args.id };
    // find study
    const study = await ctx.db.query.study(
      { where },
      `{ id title author {id} collaborators {id} }`
    );
    // check whether user has permissions to delete the item
    // TODO
    const ownsStudy = study.author.id === ctx.request.userId;
    const hasPermissions = ctx.request.user.permissions.some((permission) =>
      ["ADMIN"].includes(permission)
    );
    const isCollaborator = study.collaborators
      .map((collaborator) => collaborator.id)
      .includes(ctx.request.userId);
    if (!ownsStudy && !hasPermissions && !isCollaborator) {
      throw new Error(`You don't have permission to do that!`);
    }

    // delete it
    return ctx.db.mutation.deleteStudy({ where }, info);
  },

  // update the study
  async buildStudy(parent, args, ctx, info) {
    const tasks = args.tasks.map((task) => ({ id: task }));

    const study = await ctx.db.query.study(
      {
        where: { id: args.id },
      },
      `{ id tasks { id } consent { id } }`
    );

    // remove previous connections
    await ctx.db.mutation.updateStudy(
      {
        data: {
          tasks: {
            disconnect: study.tasks,
          },
        },
        where: {
          id: args.id,
        },
      },
      `{ id }`
    );
    // run the update method
    return ctx.db.mutation.updateStudy(
      {
        data: {
          tasks: {
            connect: tasks,
          },
        },
        where: {
          id: args.id,
        },
      },
      info
    );
  },

  // leave the study (for participants)
  async leaveStudy(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error("You must be logged in to do that!");
    }

    const profile = await ctx.db.query.profile(
      {
        where: { id: ctx.request.userId },
      },
      `{ id studiesInfo }`
    );

    // delete the information about the study in the user profile
    const information = profile.studiesInfo;
    if (information[args.id]) {
      delete information[args.id];
    }

    // disconnect user and the study
    await ctx.db.mutation.updateProfile(
      {
        data: {
          participantIn: {
            disconnect: {
              id: args.id,
            },
          },
          studiesInfo: information,
        },
        where: {
          id: ctx.request.userId,
        },
      },
      `{ id username permissions }`
    );

    return { message: "You left the study!" };
  },

  // update the study consent (for participants)
  async updateStudyConsent(parent, args, ctx, info) {
    // Check login
    if (!ctx.request.userId) {
      throw new Error("You must be logged in to do that!");
    }
    const profile = await ctx.db.query.profile(
      {
        where: { id: ctx.request.userId },
      },
      `{ id info }`
    );

    const information = profile.info;
    if (information[args.id]) {
      information[args.id] = args.info;
    }

    // update the information
    await ctx.db.mutation.updateProfile(
      {
        data: {
          info: information,
        },
        where: {
          id: ctx.request.userId,
        },
      },
      `{ id username permissions }`
    );

    const study = await ctx.db.query.study(
      {
        where: { id: args.id },
      },
      info
    );

    return study;
  },

  async updateUserStudyHideInDevelop(parent, args, ctx, info) {
    // Check login
    if (!ctx.request.userId) {
      throw new Error("You must be logged in to do that!");
    }
    const profile = await ctx.db.query.profile(
      {
        where: { id: ctx.request.userId },
      },
      `{ id studiesInfo }`
    );
    let studiesInfo = {};
    if (
      profile.studiesInfo &&
      Object.getPrototypeOf(profile.studiesInfo) === Object.prototype &&
      Object.keys(profile.studiesInfo).length > 0
    ) {
      studiesInfo = profile.studiesInfo;
      studiesInfo[args.studyId] = {
        ...studiesInfo[args.studyId],
        hideInDevelop: args.isHidden,
      };
    } else {
      studiesInfo[args.studyId] = {
        hideInDevelop: args.isHidden,
      };
    }

    // update profile
    await ctx.db.mutation.updateProfile(
      {
        data: {
          studiesInfo,
        },
        where: {
          id: ctx.request.userId,
        },
      },
      `{ id username permissions }`
    );

    return { message: "You updated the study!" };
  },

  async changeStudyAuthor(parent, args, ctx, info) {
    const { username } = args;

    if (!username) {
      throw new Error(`You should provide a username!`);
    }

    const author = await ctx.db.query.profile(
      {
        where: { username },
      },
      `{ id }`
    );

    return ctx.db.mutation.updateStudy(
      {
        where: {
          id: args.id,
        },
        data: {
          author: { connect: { id: author.id } },
        },
      },
      info
    );
  },
};

module.exports = studyMutations;
