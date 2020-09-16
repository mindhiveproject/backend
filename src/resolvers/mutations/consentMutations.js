const slugify = require('slugify');

const consentMutations = {
  async createConsent(parent, args, ctx, info) {
    // 1. Make sure that user is signed in
    const { userId } = ctx.request;
    if (!userId) {
      throw new Error(`You are not signed in`);
    }

    args.slug = slugify(args.title, {
      replacement: '-', // replace spaces with replacement character, defaults to `-`
      remove: /[^a-zA-Z\d\s:]/g, // remove characters that match regex, defaults to `undefined`
      lower: true, // convert to lower case, defaults to `false`
    });

    // check whether the slug is already in the system
    const existingConsent = await ctx.db.query.consent(
      {
        where: { slug: args.slug },
      },
      `{ id }`
    );
    if (existingConsent) {
      throw new Error(
        `The consent name ${args.title} is already taken. Please try to come up with another name.`
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

    // 2. Create a new consent
    return ctx.db.mutation.createConsent(
      {
        data: {
          title: args.title,
          slug: args.slug,
          organization: args.organization,
          description: args.description,
          info: args.info,
          settings: args.settings,
          author: {
            connect: { id: userId },
          },
          collaborators: {
            connect: collaborators,
          },
        },
      },
      info
    );
  },

  // update consent
  async updateConsent(parent, args, ctx, info) {
    console.log('args', args);
    // verify that the user has the right to update the template
    const where = { id: args.id };
    const preConsent = await ctx.db.query.consent(
      { where },
      `{ id title author {id} collaborators {id} }`
    );
    // check whether user has permissions to delete the consent
    const ownsConsent = preConsent.author.id === ctx.request.userId;
    const hasPermissions = ctx.request.user.permissions.some(permission =>
      ['ADMIN'].includes(permission)
    );
    const isCollaborator = preConsent.collaborators
      .map(collaborator => collaborator.id)
      .includes(ctx.request.userId);

    if (!ownsConsent && !hasPermissions && !isCollaborator) {
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

    const consent = await ctx.db.query.consent(
      {
        where: { id: args.id },
      },
      `{ id collaborators { id } }`
    );

    console.log('collaborators', collaborators);

    if (
      collaborators &&
      consent.collaborators &&
      collaborators.length !== consent.collaborators.length
    ) {
      // remove previous connections
      await ctx.db.mutation.updateConsent(
        {
          data: {
            collaborators: {
              disconnect: consent.collaborators,
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
    return ctx.db.mutation.updateConsent(
      {
        data: {
          ...updates,
          collaborators: {
            connect: collaborators,
          },
        },
        where: {
          id: args.id,
        },
      },
      info
    );
  },

  // delete consent (meaning delete a custom experiment)
  async deleteConsent(parent, args, ctx, info) {
    const where = { id: args.id };
    // find experiment
    const consent = await ctx.db.query.consent(
      { where },
      `{ id title author {id} }`
    );
    // check whether user has permissions to delete the consent
    const ownsConsent = consent.author.id === ctx.request.userId;
    const hasPermissions = ctx.request.user.permissions.some(permission =>
      ['ADMIN'].includes(permission)
    );
    if (!ownsConsent && !hasPermissions) {
      throw new Error(`You don't have permission to do that!`);
    }
    // delete it
    return ctx.db.mutation.deleteConsent({ where }, info);
  },
};

module.exports = consentMutations;
