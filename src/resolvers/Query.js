// this is place to interact with databases, external API, access the file system (e.g., csv file)
const { forwardTo } = require('prisma-binding');
const { hasPermission } = require('../utils');
const resultsQueries = require('./queries/resultsQueries');
const usersQueries = require('./queries/usersQueries');
const studiesQueries = require('./queries/studiesQueries');

const Query = {
  ...resultsQueries,
  ...usersQueries,
  ...studiesQueries,
  schools: forwardTo('db'),
  class: forwardTo('db'),
  result: forwardTo('db'),
  results: forwardTo('db'),
  templates: forwardTo('db'),
  template: forwardTo('db'),
  study: forwardTo('db'),
  task: forwardTo('db'),
  consent: forwardTo('db'),
  consents: forwardTo('db'),
  messages: forwardTo('db'),
  post: forwardTo('db'),
  journals: forwardTo('db'),

  proposalBoard: forwardTo('db'),
  proposalBoards: forwardTo('db'),
  proposalSection: forwardTo('db'),
  proposalSections: forwardTo('db'),
  proposalCard: forwardTo('db'),
  proposalCards: forwardTo('db'),

  // return only public studies by default
  studies(parent, args, ctx, info) {
    return ctx.db.query.studies(
      {
        where: {
          public: true,
        },
      },
      info
    );
  },

  // return only public studies by default
  tasks(parent, args, ctx, info) {
    return ctx.db.query.tasks(
      {
        where: {
          public: true,
          ...args.where,
        },
      },
      info
    );
  },

  // return posts
  posts(parent, args, ctx, info) {
    return ctx.db.query.posts(
      {
        where: {
          ...args.where,
        },
      },
      info
    );
  },

  me(parent, args, ctx, info) {
    // check if there is a current user id
    if (!ctx.request.userId) {
      return null;
    }
    return ctx.db.query.profile(
      {
        where: { id: ctx.request.userId },
      },
      info
    );
  },

  async users(parent, args, ctx, info) {
    // check if the user has permission to see all users
    if (!ctx.request.userId) {
      throw new Error('You must be logged in');
    }
    hasPermission(ctx.request.user, ['IT']);
    // query all users
    return ctx.db.query.profiles({}, info);
  },

  async myResults(parent, args, ctx, info) {
    // check if the user has permission to see all users
    if (!ctx.request.userId) {
      throw new Error('You must be logged in');
    }

    // hasPermission(ctx.request.user, ['IT']);
    // query all users
    return ctx.db.query.results(
      {
        where: {
          user: {
            id: ctx.request.userId,
          },
        },
      },
      info
    );
  },

  // show all classes
  async classes(parent, args, ctx, info) {
    // query all classes
    return ctx.db.query.classes({}, info);
  },

  async myClasses(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error('You must be logged in');
    }

    // query parameters where author is the current user
    return ctx.db.query.classes(
      {
        where: {
          creator: {
            id: ctx.request.userId,
          },
        },
      },
      info
    );
  },

  // get only templates of the user
  async myTemplates(parent, args, ctx, info) {
    // check if the user has permission to see all users
    if (!ctx.request.userId) {
      throw new Error('You must be logged in');
    }

    // query parameters where author is the current user
    return ctx.db.query.templates(
      {
        where: {
          author: {
            id: ctx.request.userId,
          },
        },
      },
      info
    );
  },

  // get only tasks of the user
  async myTasks(parent, args, ctx, info) {
    // check if the user has permission to see all users
    if (!ctx.request.userId) {
      throw new Error('You must be logged in');
    }

    // query parameters where author is the current user
    return ctx.db.query.tasks(
      {
        where: {
          OR: [
            {
              author: {
                id: ctx.request.userId,
              },
            },
            {
              collaborators_some: {
                id: ctx.request.userId,
              },
            },
          ],
          ...args.where,
        },
      },
      info
    );
  },

  // get only tasks of the user
  async myAndAllTasks(parent, args, ctx, info) {
    // check if the user has permission to see all users
    if (!ctx.request.userId) {
      throw new Error('You must be logged in');
    }

    // query parameters where author is the current user
    return ctx.db.query.tasks(
      {
        where: {
          OR: [
            {
              public: true,
            },
            {
              author: {
                id: ctx.request.userId,
              },
            },
            {
              collaborators_some: {
                id: ctx.request.userId,
              },
            },
          ],
          ...args.where,
        },
      },
      info
    );
  },

  // get only studies of the user
  async myStudies(parent, args, ctx, info) {
    // check if the user has permission to see all users
    if (!ctx.request.userId) {
      throw new Error('You must be logged in');
    }

    // query parameters where author is the current user
    return ctx.db.query.studies(
      {
        where: {
          OR: [
            {
              author: {
                id: ctx.request.userId,
              },
            },
            {
              collaborators_some: {
                id: ctx.request.userId,
              },
            },
          ],
        },
      },
      info
    );
  },

  // get only IRB protocols of the user
  async myConsents(parent, args, ctx, info) {
    // check if the user has permission to see all users
    if (!ctx.request.userId) {
      throw new Error('You must be logged in');
    }

    // query parameters where author is the current user
    return ctx.db.query.consents(
      {
        where: {
          author: {
            id: ctx.request.userId,
          },
        },
      },
      info
    );
  },

  // get only studies where user is a participant
  async myParticipatedStudies(parent, args, ctx, info) {
    // check if the user has permission to see all users
    if (!ctx.request.userId) {
      throw new Error('You must be logged in');
    }
    const profile = await ctx.db.query.profile(
      {
        where: {
          id: ctx.request.userId,
        },
      },
      `{ id participantIn { id } }`
    );
    return ctx.db.query.studies(
      {
        where: {
          id_in: profile.participantIn.map(study => study.id),
        },
      },
      info
    );
  },

  // get only journals of the user
  async myJournals(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error('You must be logged in');
    }

    return ctx.db.query.journals(
      {
        where: {
          creator: {
            id: ctx.request.userId,
          },
        },
      },
      info
    );
  },

  // get only posts of the user
  async myPosts(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error('You must be logged in');
    }

    return ctx.db.query.posts(
      {
        where: {
          author: {
            id: ctx.request.userId,
          },
        },
      },
      info
    );
  },
};

module.exports = Query;
