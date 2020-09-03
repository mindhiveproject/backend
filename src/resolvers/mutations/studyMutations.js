const slugify = require('slugify');

const studyMutations = {
  async createStudy(parent, args, ctx, info) {
    console.log('5 args', args);
    // Check login
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do that!');
    }

    args.slug = slugify(args.title, {
      replacement: '-', // replace spaces with replacement character, defaults to `-`
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
        `The study name ${args.title} is already taken. Please try to come up with another name.`
      );
    }

    // create a new IRB consent
    let consent;
    if (args.settings.consentObtained) {
      consent = await ctx.db.mutation.createConsent(
        {
          data: {
            title: args.title,
            slug: args.slug,
            info: {
              consentForm: args.info
                .filter(i => i.name === 'consentForm')
                .map(i => i.text)[0],
              consentFormForParents: args.info
                .filter(i => i.name === 'consentFormForParents')
                .map(i => i.text)[0],
            },
            author: {
              connect: {
                id: ctx.request.userId,
              },
            },
          },
        },
        `{ id }`
      );
    }

    const study = await ctx.db.mutation.createStudy(
      {
        data: {
          // this is to create a relationship between the study and the author
          author: {
            connect: {
              id: ctx.request.userId,
            },
          },
          consent: consent
            ? {
                connect: {
                  id: consent.id,
                },
              }
            : null,
          ...args,
        },
      },
      info
    );
    return study;
  },

  // update the study
  async updateStudy(parent, args, ctx, info) {
    const slug = slugify(args.title, {
      replacement: '-', // replace spaces with replacement character, defaults to `-`
      remove: /[^a-zA-Z\d\s:]/g, // remove characters that match regex, defaults to `undefined`
      lower: true, // convert to lower case, defaults to `false`
    });

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

    const study = await ctx.db.query.study(
      {
        where: { id: args.id },
      },
      `{ id collaborators { id } consent { id } }`
    );

    let consent;
    if (args.settings.consentObtained) {
      if (study.consent) {
        // update consent
        await ctx.db.mutation.updateConsent(
          {
            data: {
              info: {
                consentForm: args.info
                  .filter(i => i.name === 'consentForm')
                  .map(i => i.text)[0],
                consentFormForParents: args.info
                  .filter(i => i.name === 'consentFormForParents')
                  .map(i => i.text)[0],
              },
            },
            where: {
              id: study.consent.id,
            },
          },
          `{ id }`
        );
      } else {
        // make new consent
        consent = await ctx.db.mutation.createConsent(
          {
            data: {
              title: args.title,
              slug,
              info: {
                consentForm: args.info
                  .filter(i => i.name === 'consentForm')
                  .map(i => i.text)[0],
                consentFormForParents: args.info
                  .filter(i => i.name === 'consentFormForParents')
                  .map(i => i.text)[0],
              },
              author: {
                connect: {
                  id: ctx.request.userId,
                },
              },
            },
          },
          `{ id }`
        );
      }
    } else if (study.consent) {
      // disconnect and delete the consent
      await ctx.db.mutation.updateStudy(
        {
          data: {
            consent: {
              disconnect: study.consent.id,
            },
          },
          where: {
            id: args.id,
          },
        },
        `{ id }`
      );
      await ctx.db.mutation.deleteConsent(
        { where: { id: study.consent.id } },
        `{ id }`
      );
    }

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
    // take a copy of updates
    const updates = { ...args };
    // remove the ID from the updates
    delete updates.id;
    // run the update method
    return ctx.db.mutation.updateStudy(
      {
        data: {
          ...updates,
          collaborators: {
            connect: collaborators,
          },
          consent: consent
            ? {
                connect: {
                  id: consent.id,
                },
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

  // delete study
  async deleteStudy(parent, args, ctx, info) {
    const where = { id: args.id };
    // find study
    const study = await ctx.db.query.study(
      { where },
      `{ id title author {id} }`
    );
    // check whether user has permissions to delete the item
    // TODO
    const ownsStudy = study.author.id === ctx.request.userId;
    const hasPermissions = ctx.request.user.permissions.some(permission =>
      ['ADMIN'].includes(permission)
    );
    if (!ownsStudy && !hasPermissions) {
      throw new Error(`You don't have permission to do that!`);
    }

    // delete it
    return ctx.db.mutation.deleteStudy({ where }, info);
  },

  // update the study
  async buildStudy(parent, args, ctx, info) {
    // const { tasks } = args;
    // console.log('tasks', tasks);
    const tasks = args.tasks.map(task => ({ id: task }));

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

  // join the study (for participants)
  async joinStudy(parent, args, ctx, info) {
    // Check login
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do that!');
    }
    console.log('args', args);
    const profile = await ctx.db.query.profile(
      {
        where: { id: ctx.request.userId },
      },
      `{ id info studiesInfo consentsInfo }`
    );
    console.log('profile', profile);

    if (args.study && args.user) {
      const generalInfo = { ...args.info, ...args.user };
      console.log('generalInfo', generalInfo);

      const studyInformation = {
        ...profile.studiesInfo,
        [args.study.id]: args.user,
      };
      const consentId =
        (args.user.consentGiven &&
          args.study.consent &&
          args.study.consent.id) ||
        null;
      let consentInformation;
      if (consentId) {
        consentInformation = {
          ...profile.consentsInfo,
          [consentId]: {
            saveCoveredConsent: args.user.saveCoveredConsent,
          },
        };
      } else {
        consentInformation = profile.consentsInfo;
      }

      console.log('consentId', consentId);

      // connect user and the study
      await ctx.db.mutation.updateProfile(
        {
          data: {
            participantIn: {
              connect: {
                id: args.id,
              },
            },
            generalInfo,
            studiesInfo: studyInformation,
            consentsInfo: consentInformation,
            consentGivenFor: consentId
              ? {
                  connect: { id: consentId },
                }
              : null,
          },
          where: {
            id: ctx.request.userId,
          },
        },
        `{ id username permissions }`
      );
    }

    return { message: 'You joined the study!' };
  },

  // leave the study (for participants)
  async leaveStudy(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do that!');
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

    return { message: 'You left the study!' };
  },

  // update the study consent (for participants)
  async updateStudyConsent(parent, args, ctx, info) {
    // Check login
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do that!');
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
};

module.exports = studyMutations;
